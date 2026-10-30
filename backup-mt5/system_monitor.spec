# -*- mode: python ; coding: utf-8 -*-


from pathlib import Path

bin_dir = Path('backend/bin')
monitor_datas = [
    (str(dll_path), '.')
    for dll_path in bin_dir.glob('*.dll')
    if dll_path.exists()
]

a = Analysis(
    ['backend\\bin\\system_monitor.py'],
    pathex=[],
    binaries=[],
    datas=monitor_datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='system_monitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
