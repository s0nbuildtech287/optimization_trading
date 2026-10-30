#!/usr/bin/env python3
"""
system_monitor.py  –  Lightweight system-metric collector using psutil.

Why psutil instead of systeminformation (Node)?
  - psutil uses Windows PDH / NTAPI directly — no WMI round-trips.
  - CPU sampling is done in-process with a true sleep; no sub-process spawning.
  - Memory and disk queries are single syscalls.

Usage (daemon mode):
    python system_monitor.py --interval 30 --machine-id MY-PC

The script runs forever, printing one JSON object per line to stdout.
Node.js reads the pipe and forwards each payload to the remote server.

Requirements:
    pip install psutil
    pip install pythonnet   # Windows CPU temperature (LibreHardwareMonitorLib.dll)
"""

import argparse
import atexit
import json
import os
import platform
import socket
import sys
import time
from datetime import datetime, timedelta
import uuid
import hashlib
import subprocess

try:
    import psutil
except ImportError:
    sys.stderr.write(
        "[system_monitor] ERROR: psutil not installed.\n"
        "  Run:  pip install psutil\n"
    )
    sys.exit(1)

# ── helpers ──────────────────────────────────────────────────────────────────

# Local-time quiet window: configurable rest period
# Default: :55–:59 this hour and :00–:05 next (no collect / stdout).
QUIET_MINUTE_START = 55  # Default, will be overridden by args
QUIET_MINUTE_END = 5      # Default, will be overridden by args
QUIET_RESUME_MINUTE = 6


def _quiet_window_active(now: datetime | None = None, start_min: int = 55, end_min: int = 5) -> bool:
    """
    Check if current time is in rest period.
    
    Examples:
      - start=1, end=2   → :01-:02 (same hour, 2 minutes)
      - start=50, end=5  → :50-:59 and :00-:05 (wrap around, 16 minutes)
      - start=45, end=45 → ONLY at :45 (1 minute per hour, NOT infinite)
    """
    now = now or datetime.now()
    m = now.minute
    
    # Special case: start == end means rest ONLY at that specific minute
    # e.g., 45-45 → rest only when minute == 45
    if start_min == end_min:
        return m == start_min
    
    # Rest period wraps around hour boundary
    if start_min > end_min:
        # Wrap case: e.g., 50-5 means minute >= 50 OR minute <= 5
        return m >= start_min or m <= end_min
    else:
        # Normal case: e.g., 1-20 means minute >= 1 AND minute <= 20
        return start_min <= m <= end_min


def _seconds_until_quiet_ends(now: datetime | None = None, start_min: int = 55, end_min: int = 5) -> float:
    """
    Calculate seconds until rest period ends.
    Resume at end_min + 1.
    """
    now = now or datetime.now()
    
    if not _quiet_window_active(now, start_min, end_min):
        return 0.0
    
    # Special case: start == end → rest only at that specific minute
    # Resume at start_min + 1
    if start_min == end_min:
        resume_min = (start_min + 1) % 60
        if resume_min == 0:
            # Edge: start=59, end=59 → resume at :00 next hour
            end = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        else:
            # Normal: e.g., 45-45 → resume at :46 this hour
            end = now.replace(minute=resume_min, second=0, microsecond=0)
        
        return max(0.0, (end - now).total_seconds())
    
    resume_min = (end_min + 1) % 60
    
    # If in rest period, calculate when it ends
    if start_min > end_min:  # Wrap case
        if now.minute >= start_min:
            # In current hour (:50-:59), resume in next hour at resume_min
            if resume_min == 0:
                # edge: end=59 → resume=0 → top of next hour
                end = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            else:
                end = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1, minutes=resume_min)
        else:
            # In next hour (:00-:05), resume in this hour at resume_min
            end = now.replace(minute=resume_min, second=0, microsecond=0)
    else:  # Normal case (same hour)
        end = now.replace(minute=resume_min, second=0, microsecond=0)
        if end <= now:
            # Already past resume time in this hour, resume in next hour
            end = end + timedelta(hours=1)
    
    return max(0.0, (end - now).total_seconds())


def _machine_id(provided: str | None) -> str:
    """Return machine-id: provided > hostname > random uuid."""
    return provided or socket.gethostname() or f"unknown-{uuid.uuid4().hex[:8]}"


_BOOT_TIME = psutil.boot_time()


def _disk_info() -> list:
    """Return usage info for mounted local disks."""
    result = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue
        result.append({
            "device":      part.device,
            "mount":       part.mountpoint,
            "type":        part.fstype,
            "size":        usage.total,
            "used":        usage.used,
            "available":   usage.free,
            "usedPercent": usage.percent,
        })
    return result


# ── Network helpers ──────────────────────────────────────────────────────────

# Store previous network stats for speed calculation
_prev_net_io = None
_prev_net_timestamp = None

# Store previous CPU times for accurate percentage calculation
_prev_cpu_times = None
_prev_cpu_timestamp = None


def _get_cpu_usage() -> float:
    """
    Get CPU usage based on delta between measurements.
    This matches Task Manager's calculation method more closely.
    """
    global _prev_cpu_times, _prev_cpu_timestamp
    
    current_times = psutil.cpu_times()
    current_timestamp = time.time()
    
    # First call: use blocking measurement for initial value
    if _prev_cpu_times is None:
        _prev_cpu_times = current_times
        _prev_cpu_timestamp = current_timestamp
        # Return blocking measurement for first call
        return psutil.cpu_percent(interval=1.0)
    
    # Calculate time deltas
    prev = _prev_cpu_times
    
    # Total time spent in all states
    total_delta = sum([
        current_times.user - prev.user,
        current_times.system - prev.system,
        current_times.idle - prev.idle,
        getattr(current_times, 'iowait', 0) - getattr(prev, 'iowait', 0),
        getattr(current_times, 'irq', 0) - getattr(prev, 'irq', 0),
        getattr(current_times, 'softirq', 0) - getattr(prev, 'softirq', 0),
    ])
    
    # Active time (non-idle)
    active_delta = sum([
        current_times.user - prev.user,
        current_times.system - prev.system,
        getattr(current_times, 'irq', 0) - getattr(prev, 'irq', 0),
        getattr(current_times, 'softirq', 0) - getattr(prev, 'softirq', 0),
    ])
    
    # Update for next call
    _prev_cpu_times = current_times
    _prev_cpu_timestamp = current_timestamp
    
    # Calculate percentage
    if total_delta == 0:
        return 0.0
    
    cpu_percent = (active_delta / total_delta) * 100
    return round(max(0.0, min(100.0, cpu_percent)), 1)


# ── Network helpers (continued) ──────────────────────────────────────────────


def _is_virtual_adapter(name: str) -> bool:
    """Detect if network interface is virtual (VPN, VM, etc.)."""
    virtual_keywords = [
        'vmware', 'virtualbox', 'vbox', 'hyper-v', 'vethernet',
        'vpn', 'tunnelbear', 'nordvpn', 'expressvpn', 'protonvpn',
        'tap', 'tun', 'wintun', 'wireguard', 'openvpn',
        'hamachi', 'zerotier', 'tailscale',
        'docker', 'bridge', 'veth'
    ]
    name_lower = name.lower()
    return any(keyword in name_lower for keyword in virtual_keywords)


def _get_primary_interface() -> str:
    """Get the name of the primary network interface (has default gateway)."""
    try:
        # Get default gateway
        gateways = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        
        # Find interface with gateway (non-loopback, up, has IPv4)
        for iface_name, stats in gateways.items():
            if not stats.isup:
                continue
            if 'loopback' in iface_name.lower():
                continue
            if iface_name not in addrs:
                continue
            
            # Check if has IPv4 address
            has_ipv4 = any(
                addr.family == socket.AF_INET 
                for addr in addrs[iface_name]
            )
            if has_ipv4:
                return iface_name
        
        return ""
    except Exception:
        return ""


def _get_public_ip() -> str | None:
    """Get public IP address from external API (with timeout)."""
    try:
        import urllib.request
        # Use fast, reliable service with short timeout
        response = urllib.request.urlopen('https://api.ipify.org', timeout=2)
        return response.read().decode('utf-8').strip()
    except Exception:
        return None


def _network_interfaces() -> list:
    """Return detailed info about all network interfaces."""
    interfaces = []
    
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        io_counters = psutil.net_io_counters(pernic=True)
        
        for iface_name, addr_list in addrs.items():
            # Get interface stats
            stat = stats.get(iface_name)
            io = io_counters.get(iface_name)
            
            if not stat or not io:
                continue
            
            # Collect all addresses (IPv4, IPv6, MAC)
            addresses = []
            mac_address = None
            
            for addr in addr_list:
                if addr.family == socket.AF_INET:  # IPv4
                    addresses.append({
                        "type": "ipv4",
                        "address": addr.address,
                        "netmask": addr.netmask or "",
                    })
                elif addr.family == socket.AF_INET6:  # IPv6
                    addresses.append({
                        "type": "ipv6",
                        "address": addr.address,
                        "netmask": addr.netmask or "",
                    })
                elif addr.family == psutil.AF_LINK:  # MAC address
                    mac_address = addr.address
            
            # Skip loopback and interfaces without addresses
            if not addresses or 'loopback' in iface_name.lower():
                continue
            
            interfaces.append({
                "interface": iface_name,
                "addresses": addresses,
                "mac": mac_address,
                "isUp": stat.isup,
                "speed": stat.speed if stat.speed > 0 else None,  # Mbps
                "bytesSent": io.bytes_sent,
                "bytesRecv": io.bytes_recv,
                "packetsSent": io.packets_sent,
                "packetsRecv": io.packets_recv,
                "errorsIn": io.errin,
                "errorsOut": io.errout,
                "dropsIn": io.dropin,
                "dropsOut": io.dropout,
            })
    except Exception as e:
        sys.stderr.write(f"[system_monitor] error getting network interfaces: {e}\n")
    
    return interfaces


def _network_stats() -> dict:
    """Calculate network statistics including upload/download speed."""
    global _prev_net_io, _prev_net_timestamp
    
    try:
        current_io = psutil.net_io_counters()
        current_time = time.time()
        
        # Calculate speeds (KB/s) based on delta
        upload_speed = 0
        download_speed = 0
        
        if _prev_net_io and _prev_net_timestamp:
            time_delta = current_time - _prev_net_timestamp
            if time_delta > 0:
                bytes_sent_delta = current_io.bytes_sent - _prev_net_io.bytes_sent
                bytes_recv_delta = current_io.bytes_recv - _prev_net_io.bytes_recv
                
                upload_speed = round((bytes_sent_delta / time_delta) / 1024, 2)  # KB/s
                download_speed = round((bytes_recv_delta / time_delta) / 1024, 2)  # KB/s
        
        # Store current for next calculation
        _prev_net_io = current_io
        _prev_net_timestamp = current_time
        
        # Get connection counts
        connections = psutil.net_connections(kind='inet')
        tcp_established = sum(1 for c in connections if c.status == 'ESTABLISHED')
        tcp_listen = sum(1 for c in connections if c.status == 'LISTEN')
        
        return {
            "totalBytesSent": current_io.bytes_sent,
            "totalBytesRecv": current_io.bytes_recv,
            "uploadSpeed": max(0, upload_speed),
            "downloadSpeed": max(0, download_speed),
            "activeConnections": len(connections),
            "tcpEstablished": tcp_established,
            "tcpListen": tcp_listen,
        }
    except Exception as e:
        sys.stderr.write(f"[system_monitor] error getting network stats: {e}\n")
        return {
            "totalBytesSent": 0,
            "totalBytesRecv": 0,
            "uploadSpeed": 0,
            "downloadSpeed": 0,
            "activeConnections": 0,
            "tcpEstablished": 0,
            "tcpListen": 0,
        }


def _network_summary(interfaces: list) -> dict:
    """Generate network summary with VPN detection."""
    try:
        primary_iface = _get_primary_interface()
        primary_ip = ""
        
        # Get primary IP
        if primary_iface:
            for iface in interfaces:
                if iface["interface"] == primary_iface:
                    ipv4_addrs = [a["address"] for a in iface["addresses"] if a["type"] == "ipv4"]
                    primary_ip = ipv4_addrs[0] if ipv4_addrs else ""
                    break
        
        # Detect virtual adapters
        virtual_adapters = [
            iface["interface"] 
            for iface in interfaces 
            if _is_virtual_adapter(iface["interface"])
        ]
        
        # Get public IP (with timeout, may fail)
        public_ip = _get_public_ip()
        
        return {
            "primaryIP": primary_ip,
            "publicIP": public_ip,
            "interfaceCount": len(interfaces),
            "vpnDetected": len(virtual_adapters) > 0,
            "virtualAdapters": virtual_adapters,
        }
    except Exception as e:
        sys.stderr.write(f"[system_monitor] error getting network summary: {e}\n")
        return {
            "primaryIP": "",
            "publicIP": None,
            "interfaceCount": 0,
            "vpnDetected": False,
            "virtualAdapters": [],
        }


def _get_current_user() -> str:
    """Get the username running this script."""
    return os.environ.get("USERNAME") or os.environ.get("USER") or "unknown"


def _all_user_sessions() -> list:
    """Return list of ALL user sessions (Active, Disconnect, etc.)."""
    users = []
    try:
        # On Windows: use 'query session' to get ALL sessions
        if platform.system().lower() == "windows":
            result = subprocess.run(["query", "session"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
            
            for line in result.stdout.splitlines()[1:]:  # Skip header
                original_line = line
                line = line.strip()
                if not line or line.lower().startswith("sessionname"):
                    continue
                
                # Parse with robust logic for variable column spacing
                # Example lines:
                #  services                           0  Disc            (no username)
                # >console           Administrator     1  Active         (has username)
                #  rdp-tcp#0          UserName          2  Disc           (has username)
                #  komisan                             2  Disc           (session name IS username, no separate username field)
                
                # Check if line starts with '>' (active session marker)
                is_active_marker = line.startswith(">")
                if is_active_marker:
                    line = line[1:].strip()
                
                # Split by multiple spaces to better handle column alignment
                parts = line.split()
                if len(parts) < 3:
                    continue
                
                # Extract fields based on column positions
                session_name = parts[0]
                username = ""
                session_id = ""
                state = ""
                
                # More robust parsing logic
                if len(parts) == 3:
                    # Format: sessionname  id  state
                    if parts[1].isdigit():
                        session_id = parts[1]
                        state = parts[2]
                        
                        # Check if session_name looks like a username (not a system session)
                        # System sessions: services, rdp-tcp, rdp-tcp#0, console
                        if not any(sys_name in session_name.lower() for sys_name in ['services', 'rdp-tcp', 'console', 'listen']):
                            # Session name IS the username (disconnected session)
                            username = session_name
                        else:
                            username = ""
                    else:
                        # Unusual format, skip
                        sys.stderr.write(f"[system_monitor] skipping unusual line: {original_line}\n")
                        continue
                elif len(parts) >= 4:
                    # Format: sessionname  username  id  state
                    username = parts[1]
                    session_id = parts[2]
                    state = parts[3]
                
                # Skip sessions without username (services, listeners, etc.)
                if not username:
                    continue
                
                # Include user sessions (Active, Disc, etc.)
                users.append({
                    "user": username,
                    "sessionName": session_name,
                    "state": state,
                    "sessionId": session_id,
                })
        else:
            # On Unix/Linux: use who command
            result = subprocess.run(["who"], capture_output=True, text=True)
            for line in result.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2:
                    users.append({
                        "user": parts[0],
                        "sessionName": parts[1],
                        "state": "Active",
                        "sessionId": "",
                    })
    except Exception as e:
        sys.stderr.write(f"[system_monitor] error getting user sessions: {e}\n")
    return users


# ── static info (collected once at startup) ──────────────────────────────────

def _get_cpu_brand() -> str:
    """Get CPU brand name (e.g., Intel(R) Xeon(R) CPU E5-2620 v4 @ 2.10GHz)."""
    try:
        # On Windows: read from registry
        if platform.system().lower() == "windows":
            try:
                import winreg
                key = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
                )
                brand, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                winreg.CloseKey(key)
                return brand.strip()
            except Exception:
                pass
        
        # Fallback: try platform.processor()
        proc = platform.processor()
        if proc and "Family" not in proc:  # Avoid "Intel64 Family 6 Model 79..."
            return proc
        
        # Last resort
        return platform.uname().processor or platform.uname().machine
    except Exception:
        return "Unknown"


def _get_cpu_manufacturer(brand: str) -> str:
    """Extract manufacturer from CPU brand string."""
    brand_lower = brand.lower()
    if "intel" in brand_lower:
        return "Intel"
    elif "amd" in brand_lower:
        return "AMD"
    elif "arm" in brand_lower:
        return "ARM"
    elif "apple" in brand_lower:
        return "Apple"
    else:
        return platform.uname().machine


# ── Hardware temperature sensors ─────────────────────────────────────────────

_OHM_COMPUTER = None
_OHM_INIT_ATTEMPTED = False
_OHM_CLOSE_NAMESPACE = None


def _ohm_dll_path() -> str:
    # PyInstaller one-file extracts bundled data into _MEIPASS. Keep the
    # executable directory as a fallback so an externally supplied DLL also
    # continues to work in development and existing installations.
    candidates: list[str] = []
    dll_names = ["LibreHardwareMonitorLib.dll", "OpenHardwareMonitorLib.dll"]
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.extend(os.path.join(meipass, name) for name in dll_names)
        candidates.extend(os.path.join(os.path.dirname(sys.executable), name) for name in dll_names)
    else:
        candidates.extend(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
            for name in dll_names
        )

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return candidates[0]


def _init_ohm_computer():
    """Lazy-init OpenHardwareMonitor once for the daemon lifetime."""
    global _OHM_COMPUTER, _OHM_INIT_ATTEMPTED

    if platform.system().lower() != "windows":
        return None

    if _OHM_COMPUTER is not None or _OHM_INIT_ATTEMPTED:
        return _OHM_COMPUTER

    _OHM_INIT_ATTEMPTED = True

    dll_path = _ohm_dll_path()
    if not os.path.exists(dll_path):
        sys.stderr.write(f"[system_monitor] Hardware monitor DLL not found at {dll_path}\n")
        return None

    try:
        import clr
        clr.AddReference(dll_path)
        is_libre = os.path.basename(dll_path).lower().startswith("libre")
        if is_libre:
            # pyrefly: ignore [missing-import]
            from LibreHardwareMonitor.Hardware import Computer
            global _OHM_CLOSE_NAMESPACE
            _OHM_CLOSE_NAMESPACE = "LibreHardwareMonitor"
        else:
            # pyrefly: ignore [missing-import]
            from OpenHardwareMonitor.Hardware import Computer
            _OHM_CLOSE_NAMESPACE = "OpenHardwareMonitor"

        computer = Computer()
        if is_libre:
            # LibreHardwareMonitor uses the Is*Enabled property names.
            # Mainboard is important because CPU Core often comes from the
            # motherboard Super-I/O chip (for example Nuvoton NCT6779D).
            computer.IsCpuEnabled = True
            computer.IsMotherboardEnabled = True
            computer.IsControllerEnabled = True
            computer.IsGpuEnabled = False
        else:
            computer.CPUEnabled = True
            computer.MainboardEnabled = True
            computer.GPUEnabled = False
        computer.Open()
        _OHM_COMPUTER = computer
    except Exception as exc:
        sys.stderr.write(f"[system_monitor] OpenHardwareMonitor init failed: {exc}\n")

    return _OHM_COMPUTER


def _close_ohm_computer() -> None:
    global _OHM_COMPUTER
    if _OHM_COMPUTER is None:
        return
    try:
        _OHM_COMPUTER.Close()
    except Exception:
        pass
    _OHM_COMPUTER = None


atexit.register(_close_ohm_computer)


def _is_cpu_core_sensor(sensor_name: str) -> bool:
    name = sensor_name.strip()
    lower = name.lower()
    return lower.startswith("cpu core") or lower in {"core", "core average"}


def _is_cpu_package_sensor(sensor_name: str) -> bool:
    name = sensor_name.strip().lower()
    return name in {
        "cpu package", "package", "cpu tdie", "tdie", "cpu tctl",
        "tctl", "cpu die", "die", "cpu temperature", "cpu temp",
    }


def _is_cpu_core_temp_sensor(sensor_name: str) -> bool:
    name = sensor_name.strip().lower()
    return _is_cpu_core_sensor(name) or name.startswith("core #") or name.startswith("core ") or name == "cpu core"


def _iter_hardware(hardware_items):
    """Yield top-level and nested LibreHardwareMonitor hardware nodes."""
    for hardware in hardware_items:
        yield hardware
        try:
            yield from _iter_hardware(hardware.SubHardware)
        except Exception:
            pass


def _get_cpu_package_temperature_ohm() -> float | None:
    """Read CPU temperature from CPU or motherboard sensors."""
    computer = _init_ohm_computer()
    if computer is None:
        return None

    try:
        package_temps: list[float] = []
        core_temps: list[float] = []
        motherboard_cpu_temps: list[float] = []
        sensor_count = 0
        for hardware in _iter_hardware(computer.Hardware):
            hardware.Update()
            for sensor in hardware.Sensors:
                if str(sensor.SensorType) != "Temperature":
                    continue

                sensor_name = str(sensor.Name).strip()
                value = sensor.Value
                if value is not None:
                    sensor_count += 1
                    temp = round(float(value), 1)
                    if _is_cpu_package_sensor(sensor_name):
                        package_temps.append(temp)
                    elif _is_cpu_core_temp_sensor(sensor_name):
                        core_temps.append(temp)
                    elif str(hardware.HardwareType).lower() in {"motherboard", "superio"} and "cpu" in sensor_name.lower():
                        motherboard_cpu_temps.append(temp)

        if package_temps:
            return round(sum(package_temps) / len(package_temps), 1)
        if core_temps:
            return round(sum(core_temps) / len(core_temps), 1)
        if motherboard_cpu_temps:
            return round(sum(motherboard_cpu_temps) / len(motherboard_cpu_temps), 1)

        if sensor_count == 0:
            sys.stderr.write("[system_monitor] Hardware monitor found no usable temperature values\n")

        return None
    except Exception as exc:
        sys.stderr.write(f"[system_monitor] Hardware temperature read failed: {exc}\n")
        return None


def _get_cpu_temperature_psutil() -> float | None:
    """Fallback CPU temperature via psutil (mainly Linux)."""
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None

        for name in ["coretemp", "k10temp", "zenpower", "cpu_thermal", "cpu-thermal"]:
            if name in temps:
                entries = temps[name]
                if entries:
                    return round(sum(entry.current for entry in entries) / len(entries), 1)

        for name, entries in temps.items():
            if entries and ("cpu" in name.lower() or "core" in name.lower()):
                return round(sum(entry.current for entry in entries) / len(entries), 1)

        return None
    except (AttributeError, OSError):
        return None


def _get_cpu_temperature() -> float | None:
    """Get CPU Package temperature in Celsius. Returns None if unavailable."""
    temp = _get_cpu_package_temperature_ohm()
    if temp is not None:
        return temp
    return _get_cpu_temperature_psutil()


def _static_info() -> dict:
    freq = psutil.cpu_freq()
    uname = platform.uname()
    cpu_brand = _get_cpu_brand()
    cpu_manufacturer = _get_cpu_manufacturer(cpu_brand)
    
    return {
        "hostname":      socket.gethostname(),
        "platform":      uname.system.lower(),
        "os": {
            "platform": uname.system.lower(),
            "distro":   uname.version,
            "release":  uname.release,
            "arch":     uname.machine,
            "hostname": socket.gethostname(),
        },
        "cpu_static": {
            "manufacturer": cpu_manufacturer,
            "brand":        cpu_brand,
            "cores":        psutil.cpu_count(logical=True)  or 1,
            "physicalCores": psutil.cpu_count(logical=False) or 1,
        },
    }


# ── single snapshot ───────────────────────────────────────────────────────────

def collect(machine_id: str, static: dict, rest_start: int, rest_end: int) -> dict:
    """Collect one snapshot. CPU uses delta-based calculation for accuracy."""

    # ── CPU (delta-based, non-blocking after first call)
    cpu_pct  = _get_cpu_usage()
    freq     = psutil.cpu_freq()
    cpu_speed = round(freq.current / 1000, 2) if freq else 0.0  # GHz
    cpu_temp = _get_cpu_temperature()

    # ── Memory
    mem  = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # ── Assemble
    cpu_data = {
        **static["cpu_static"],
        "speed":       cpu_speed,
        "currentLoad": cpu_pct,
    }
    
    # Add temperature only if available
    if cpu_temp is not None:
        cpu_data["temperature"] = cpu_temp
    
    return {
        "machineId": machine_id,
        "timestamp": int(time.time() * 1000),
        "hostname":  static["hostname"],
        "platform":  static["platform"],

        "cpu": cpu_data,

        "memory": {
            "total":       mem.total,
            "free":        mem.available,
            "used":        mem.used,
            "usedPercent": mem.percent,
            "swapTotal":   swap.total,
            "swapUsed":    swap.used,
        },

        # Disk is cheap enough to query every cycle
        "disks": _disk_info(),

        "session": {
            "currentUser": _get_current_user(),
            "uptime":      int(time.time() - _BOOT_TIME),
            "bootTime":    int(_BOOT_TIME),
            "processes":   len(psutil.pids()),
            "activeUsers": _all_user_sessions(),
        },

        "os": static["os"],

        # Network information
        "network": _network_interfaces(),
        "networkStats": _network_stats(),
        "networkSummary": _network_summary(_network_interfaces()),

        # Rest period configuration
        "restPeriod": {
            "startMinute": rest_start,
            "endMinute": rest_end,
        },

        # No process enumeration — that's the main WMI killer on Windows.
        # Uncomment below only if you really need it (costs ~50ms on most machines):
        # "topProcesses": _top_processes(10),
    }


# Optional – kept but not called by default
def _top_processes(n: int) -> list:
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
        try:
            procs.append({
                "pid":  p.info["pid"],
                "name": p.info["name"],
                "cpu":  p.info["cpu_percent"] or 0.0,
                "mem":  round(p.info["memory_percent"] or 0.0, 2),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return sorted(procs, key=lambda x: x["cpu"], reverse=True)[:n]


# ── main loop ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Lightweight system monitor (psutil)")
    parser.add_argument("--interval",   type=float, default=30, help="Seconds between samples")
    parser.add_argument("--machine-id", type=str,   default=None)
    parser.add_argument("--rest-start", type=int,   default=55, help="Rest period start minute (0-59)")
    parser.add_argument("--rest-end",   type=int,   default=5,  help="Rest period end minute (0-59)")
    args = parser.parse_args()

    machine_id = _machine_id(args.machine_id)
    interval   = max(5.0, args.interval)   # minimum 5s
    rest_start = max(0, min(59, args.rest_start))
    rest_end   = max(0, min(59, args.rest_end))

    sys.stderr.write(
        f"[system_monitor] started  machine={machine_id}  interval={interval}s  rest={rest_start:02d}–{rest_end:02d}\n"
    )
    sys.stderr.flush()

    static = _static_info()

    # Initialize CPU measurement (first call will use blocking mode)
    _get_cpu_usage()

    while True:
        if _quiet_window_active(start_min=rest_start, end_min=rest_end):
            pause = _seconds_until_quiet_ends(start_min=rest_start, end_min=rest_end)
            if pause > 0:
                sys.stderr.write(
                    f"[system_monitor] quiet window (local :{rest_start:02d}–:"
                    f"{rest_end:02d}) – pausing collect for {pause:.0f}s\n"
                )
                sys.stderr.flush()
                time.sleep(pause)
            else:
                # Edge case: should not happen, but avoid infinite loop
                sys.stderr.write(f"[system_monitor] WARNING: quiet window active but pause=0, sleeping 60s\n")
                sys.stderr.flush()
                time.sleep(60)
            continue

        cycle_start = time.monotonic()
        try:
            payload = collect(machine_id, static, rest_start, rest_end)
            line = json.dumps(payload, separators=(",", ":"))
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
        except Exception as exc:
            sys.stderr.write(f"[system_monitor] collect error: {exc}\n")
            sys.stderr.flush()

        # Sleep for the remainder of the interval (accounting for collection time)
        elapsed = time.monotonic() - cycle_start
        sleep_for = max(0.0, interval - elapsed)
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()
