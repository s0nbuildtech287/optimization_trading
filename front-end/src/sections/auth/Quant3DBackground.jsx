import React, { useEffect, useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import * as THREE from 'three';
import { API_BASE_URL } from 'config';

const TARGET_SYMBOLS = [
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD',
  'XAUUSD', 'XAGUSD', 'USOIL',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD',
  'US500', 'DE30', 'JP225', 'HK50',
  'NVDA', 'AAPL', 'TSLA', 'MSFT'
];

const INITIAL_ASSETS = [
  { rawSymbol: 'BTCUSD', s: 'BTC/USD', price: 79649.3, change: -0.45, prefix: '$', decimals: 2 },
  { rawSymbol: 'ETHUSD', s: 'ETH/USD', price: 2308.95, change: -0.49, prefix: '$', decimals: 2 },
  { rawSymbol: 'SOLUSD', s: 'SOL/USD', price: 99.66, change: -1.09, prefix: '$', decimals: 2 },
  { rawSymbol: 'BNBUSD', s: 'BNB/USD', price: 735.42, change: -0.81, prefix: '$', decimals: 2 },
  { rawSymbol: 'XRPUSD', s: 'XRP/USD', price: 1.2979, change: -0.64, prefix: '$', decimals: 4 },
  { rawSymbol: 'XAUUSD', s: 'XAU/USD', price: 4008.4, change: -0.74, prefix: '$', decimals: 2 },
  { rawSymbol: 'XAGUSD', s: 'XAG/USD', price: 52.92, change: -2.61, prefix: '$', decimals: 2 },
  { rawSymbol: 'USOIL',  s: 'WTI OIL', price: 102.41, change: 0.64, prefix: '$', decimals: 2 },
  { rawSymbol: 'EURUSD', s: 'EUR/USD', price: 1.1159, change: -0.18, prefix: '', decimals: 4 },
  { rawSymbol: 'GBPUSD', s: 'GBP/USD', price: 1.3321, change: -0.16, prefix: '', decimals: 4 },
  { rawSymbol: 'USDJPY', s: 'USD/JPY', price: 157.78, change: 0.20, prefix: '¥', decimals: 2 },
  { rawSymbol: 'AUDUSD', s: 'AUD/USD', price: 0.7022, change: 0.07, prefix: '', decimals: 4 },
  { rawSymbol: 'US500',  s: 'S&P 500', price: 7713.0, change: -0.02, prefix: '', decimals: 2 },
  { rawSymbol: 'DE30',   s: 'DAX 40', price: 43.91, change: 0.60, prefix: '€', decimals: 2 },
  { rawSymbol: 'JP225',  s: 'NIKKEI', price: 63700.0, change: 1.30, prefix: '¥', decimals: 0 },
  { rawSymbol: 'HK50',   s: 'HSI 50', price: 23041.3, change: -0.23, prefix: 'HK$', decimals: 2 },
  { rawSymbol: 'NVDA',   s: 'NVDA', price: 216.0, change: 2.39, prefix: '$', decimals: 2 },
  { rawSymbol: 'AAPL',   s: 'AAPL', price: 343.91, change: -1.10, prefix: '$', decimals: 2 },
  { rawSymbol: 'TSLA',   s: 'TSLA', price: 391.62, change: 5.21, prefix: '$', decimals: 2 },
  { rawSymbol: 'MSFT',   s: 'MSFT', price: 532.6, change: 1.54, prefix: '$', decimals: 2 }
];

const formatPrice = (item) => {
  const formatted = Number(item.price || 0).toLocaleString('en-US', {
    minimumFractionDigits: item.decimals,
    maximumFractionDigits: item.decimals
  });
  return `${item.prefix}${formatted}`;
};

/**
 * Institutional Quant Trading Terminal & Full-Atmosphere Background
 * - Panoramic dual-wing TradingView candlestick charts (balanced across Left & Right, no empty voids)
 * - Upper Quant Neural Constellation (interconnected nodes & cyber web filling the upper space)
 * - Flowing 3D Particle Volatility Wave at base with smooth mathematical undulation
 * - Cyber Aurora ambient glow & tech grid lighting up the entire space (eliminates pitch black void)
 * - Live Financial Ticker Tape streaming and live-updating 20 financial assets via Yahoo Finance
 * - Interactive mouse parallax with smooth damping
 */
export default function Quant3DBackground() {
  const mountRef = useRef(null);
  const [assets, setAssets] = useState(INITIAL_ASSETS);

  // Fetch real-time live prices directly from Yahoo Finance via backend endpoint
  const fetchLiveMarketPrices = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/api/market/prices?symbols=${TARGET_SYMBOLS.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const list = Array.isArray(json) ? json : json?.data || [];
      if (!list.length) return;

      const priceMap = new Map();
      list.forEach((entry) => {
        if (entry && entry.symbol && entry.price != null) {
          priceMap.set(entry.symbol.toUpperCase(), entry);
        }
      });

      setAssets((prev) =>
        prev.map((item) => {
          const live = priceMap.get(item.rawSymbol);
          if (!live) return item;
          return {
            ...item,
            price: Number(live.price),
            change: live.changePct != null ? Number(Number(live.changePct).toFixed(2)) : item.change
          };
        })
      );
    } catch {
      // Graceful fallback to initial values if network hiccup occurs
    }
  }, []);

  useEffect(() => {
    fetchLiveMarketPrices();
    // Poll Yahoo Finance real-time prices every 25 seconds
    const interval = setInterval(fetchLiveMarketPrices, 25000);
    return () => clearInterval(interval);
  }, [fetchLiveMarketPrices]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 1000);
    camera.position.set(0, 5, 42);
    camera.lookAt(0, 4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060914, 1);
    container.appendChild(renderer.domElement);

    // =========================================================================
    // 2. 3D PARTICLE VOLATILITY WAVE (Base Terrain)
    // =========================================================================
    const gridCols = 80;
    const gridRows = 60;
    const totalPoints = gridCols * gridRows;
    const separation = 1.45;

    const wavePositions = new Float32Array(totalPoints * 3);
    const waveColors = new Float32Array(totalPoints * 3);

    const colorCyan = new THREE.Color(0x00f0ff);
    const colorBlue = new THREE.Color(0x1d4ed8);
    const colorTeal = new THREE.Color(0x089981);

    let pIdx = 0;
    for (let ix = 0; ix < gridCols; ix++) {
      for (let iz = 0; iz < gridRows; iz++) {
        const x = (ix - gridCols / 2) * separation;
        const z = (iz - gridRows / 2) * separation - 4;
        const y = -7.0;

        wavePositions[pIdx * 3] = x;
        wavePositions[pIdx * 3 + 1] = y;
        wavePositions[pIdx * 3 + 2] = z;

        const factor = (ix / gridCols + iz / gridRows) * 0.5;
        const vertexColor = new THREE.Color();
        if (factor < 0.45) {
          vertexColor.copy(colorBlue).lerp(colorCyan, factor / 0.45);
        } else {
          vertexColor.copy(colorCyan).lerp(colorTeal, (factor - 0.45) / 0.55);
        }

        waveColors[pIdx * 3] = vertexColor.r;
        waveColors[pIdx * 3 + 1] = vertexColor.g;
        waveColors[pIdx * 3 + 2] = vertexColor.b;
        pIdx++;
      }
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(waveColors, 3));

    const createParticleTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.35, 'rgba(0, 240, 255, 0.9)');
      grad.addColorStop(0.7, 'rgba(8, 153, 129, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(canvas);
    };

    const particleMaterial = new THREE.PointsMaterial({
      size: 1.45,
      map: createParticleTexture(),
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleWave = new THREE.Points(particlesGeometry, particleMaterial);
    scene.add(particleWave);

    // =========================================================================
    // 3. UPPER QUANT NEURAL CONSTELLATION (Fills the upper dark void)
    // =========================================================================
    const nodeCount = 65;
    const nodePositions = [];
    const nodeGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const nodeMatCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const nodeMatTeal = new THREE.MeshBasicMaterial({ color: 0x089981 });
    const constellationGroup = new THREE.Group();

    for (let i = 0; i < nodeCount; i++) {
      // Spread across upper space (x: -45 to 45, y: 8 to 24, z: -15 to -2)
      const nx = (Math.random() - 0.5) * 85;
      const ny = 7 + Math.random() * 16;
      const nz = -18 + Math.random() * 14;

      const nMesh = new THREE.Mesh(nodeGeo, i % 3 === 0 ? nodeMatTeal : nodeMatCyan);
      nMesh.position.set(nx, ny, nz);
      constellationGroup.add(nMesh);
      nodePositions.push({ mesh: nMesh, basePos: new THREE.Vector3(nx, ny, nz), vx: (Math.random() - 0.5) * 0.015, vy: (Math.random() - 0.5) * 0.012 });
    }

    // Connect close nodes with thin glowing lines (neural network / distributed nodes)
    const lineIndices = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodePositions[i].basePos.distanceTo(nodePositions[j].basePos);
        if (dist < 14) {
          lineIndices.push(i, j);
        }
      }
    }

    const netLinePositions = new Float32Array(lineIndices.length * 3);
    const netLinesGeo = new THREE.BufferGeometry();
    netLinesGeo.setAttribute('position', new THREE.BufferAttribute(netLinePositions, 3));
    const netLinesMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.12 });
    const netLinesMesh = new THREE.LineSegments(netLinesGeo, netLinesMat);
    constellationGroup.add(netLinesMesh);

    scene.add(constellationGroup);

    // =========================================================================
    // 4. PANORAMIC TRADINGVIEW CANDLESTICK CHARTS (BALANCED LEFT & RIGHT)
    // =========================================================================
    const COLOR_BULL = 0x089981; // TradingView Teal
    const COLOR_BEAR = 0xf23645; // TradingView Red
    const COLOR_EMA_FAST = 0x00f0ff;
    const COLOR_EMA_SLOW = 0xf59e0b;

    const chartGroup = new THREE.Group();

    // Standard TradingView Materials
    const bullBodyMat = new THREE.MeshBasicMaterial({ color: COLOR_BULL });
    const bearBodyMat = new THREE.MeshBasicMaterial({ color: COLOR_BEAR });
    const wickBullMat = new THREE.LineBasicMaterial({ color: COLOR_BULL, transparent: true, opacity: 0.95 });
    const wickBearMat = new THREE.LineBasicMaterial({ color: COLOR_BEAR, transparent: true, opacity: 0.95 });
    const volBullMat = new THREE.MeshBasicMaterial({ color: COLOR_BULL, transparent: true, opacity: 0.45 });
    const volBearMat = new THREE.MeshBasicMaterial({ color: COLOR_BEAR, transparent: true, opacity: 0.45 });

    const candleWidth = 0.92;
    const candleMeshes = [];

    // Helper to build a complete TradingView chart segment
    const buildChartSegment = (candleProfiles, startX, baseCenterY, zDepth, isRightSide) => {
      const count = candleProfiles.length;
      const spacing = 1.35;
      const fastEmaPts = [];
      const slowEmaPts = [];

      candleProfiles.forEach((candle, idx) => {
        const x = startX + idx * spacing;
        const { open, close, high, low, volume, isBull } = candle;
        const bodyHeight = Math.max(0.18, Math.abs(close - open));
        const bodyY = (open + close) / 2 + baseCenterY;
        const curHigh = high + baseCenterY;
        const curLow = low + baseCenterY;

        // 1. Candlestick Flat Body (TradingView 2D plane in 3D)
        const bodyGeo = new THREE.PlaneGeometry(candleWidth, bodyHeight);
        const bodyMesh = new THREE.Mesh(bodyGeo, isBull ? bullBodyMat : bearBodyMat);
        bodyMesh.position.set(x, bodyY, zDepth + 0.05);
        chartGroup.add(bodyMesh);

        // 2. Clean 1px Wick from Low to High
        const wickGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, curLow, zDepth),
          new THREE.Vector3(x, curHigh, zDepth)
        ]);
        const wickLine = new THREE.Line(wickGeo, isBull ? wickBullMat : wickBearMat);
        chartGroup.add(wickLine);

        // 3. Volume Bar at bottom of chart
        const volHeight = volume * 0.85;
        const volGeo = new THREE.PlaneGeometry(candleWidth * 0.82, volHeight);
        const volMesh = new THREE.Mesh(volGeo, isBull ? volBullMat : volBearMat);
        volMesh.position.set(x, baseCenterY - 4.5 + volHeight / 2, zDepth + 0.02);
        chartGroup.add(volMesh);

        candleMeshes.push({ bodyMesh, wickLine, volMesh, baseY: bodyY, idx });

        fastEmaPts.push(new THREE.Vector3(x, bodyY, zDepth + 0.1));
        slowEmaPts.push(new THREE.Vector3(x, bodyY * 0.94 + 0.3, zDepth + 0.08));
      });

      // EMA Lines
      if (fastEmaPts.length > 2) {
        const fastCurve = new THREE.CatmullRomCurve3(fastEmaPts, false, 'centripetal', 0.4);
        const fastGeo = new THREE.BufferGeometry().setFromPoints(fastCurve.getPoints(count * 3));
        const fastLine = new THREE.Line(fastGeo, new THREE.LineBasicMaterial({ color: COLOR_EMA_FAST, linewidth: 2 }));
        chartGroup.add(fastLine);

        const slowCurve = new THREE.CatmullRomCurve3(slowEmaPts, false, 'centripetal', 0.4);
        const slowGeo = new THREE.BufferGeometry().setFromPoints(slowCurve.getPoints(count * 3));
        const slowLine = new THREE.Line(slowGeo, new THREE.LineBasicMaterial({ color: COLOR_EMA_SLOW, transparent: true, opacity: 0.8 }));
        chartGroup.add(slowLine);
      }

      // Horizontal Dotted Price Levels
      [-2, 2, 6, 10].forEach((level) => {
        const gy = baseCenterY + level;
        const gGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(startX - 1, gy, zDepth - 0.05),
          new THREE.Vector3(startX + count * spacing + 1, gy, zDepth - 0.05)
        ]);
        const gLine = new THREE.Line(gGeo, new THREE.LineDashedMaterial({ color: 0x1e293b, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.65 }));
        gLine.computeLineDistances();
        chartGroup.add(gLine);
      });

      // Volume Base Line
      const vBaseGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(startX - 1, baseCenterY - 4.5, zDepth),
        new THREE.Vector3(startX + count * spacing + 1, baseCenterY - 4.5, zDepth)
      ]);
      const vBaseLine = new THREE.Line(vBaseGeo, new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.7 }));
      chartGroup.add(vBaseLine);
    };

    // Generate Left Wing Candles (BTC/USD Wave)
    const leftCandles = [];
    let lPrice = 2.0;
    for (let i = 0; i < 28; i++) {
      const step = Math.sin(i * 0.45) * 0.85 + (i * 0.06);
      const open = lPrice;
      const close = Math.max(0.5, open + step);
      const isBull = close >= open;
      const high = Math.max(open, close) + 0.3 + Math.abs(Math.sin(i * 2.1)) * 0.8;
      const low = Math.max(0.2, Math.min(open, close) - 0.25 - Math.abs(Math.cos(i * 1.8)) * 0.7);
      const volume = Math.max(0.6, Math.abs(close - open) * 1.5 + (i % 5 === 0 ? 1.5 : 0.4));
      leftCandles.push({ open, close, high, low, volume, isBull });
      lPrice = close;
    }
    // Render Left Chart (spans from x: -44 to x: -8)
    buildChartSegment(leftCandles, -44, 2.5, 0, false);

    // Generate Right Wing Candles (ETH/USD Wave - balances the right side perfectly)
    const rightCandles = [];
    let rPrice = 3.5;
    for (let i = 0; i < 28; i++) {
      const step = Math.cos(i * 0.42) * 0.85 + (i * 0.05);
      const open = rPrice;
      const close = Math.max(0.5, open + step);
      const isBull = close >= open;
      const high = Math.max(open, close) + 0.3 + Math.abs(Math.cos(i * 2.4)) * 0.8;
      const low = Math.max(0.2, Math.min(open, close) - 0.25 - Math.abs(Math.sin(i * 1.9)) * 0.7);
      const volume = Math.max(0.6, Math.abs(close - open) * 1.5 + (i % 4 === 0 ? 1.4 : 0.3));
      rightCandles.push({ open, close, high, low, volume, isBull });
      rPrice = close;
    }
    // Render Right Chart (spans from x: 8 to x: 44)
    buildChartSegment(rightCandles, 8, 2.5, 0, true);

    // Active Live Price Badge on Right Edge
    const lastRight = rightCandles[rightCandles.length - 1];
    const livePriceY = (lastRight.close + 2.5);

    const livePriceGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(8, livePriceY, 0.12),
      new THREE.Vector3(45.5, livePriceY, 0.12)
    ]);
    const livePriceLine = new THREE.Line(livePriceGeo, new THREE.LineDashedMaterial({ color: 0x089981, dashSize: 0.8, gapSize: 0.4 }));
    livePriceLine.computeLineDistances();
    chartGroup.add(livePriceLine);

    const createPriceBadgeTexture = (priceText) => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#089981';
      ctx.beginPath();
      ctx.roundRect(4, 4, 232, 62, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceText, 120, 35);
      return new THREE.CanvasTexture(canvas);
    };

    const priceBadgeTexture = createPriceBadgeTexture('68,952.40');
    const badgeSpriteMat = new THREE.SpriteMaterial({ map: priceBadgeTexture, transparent: true, opacity: 0.95 });
    const priceBadgeSprite = new THREE.Sprite(badgeSpriteMat);
    priceBadgeSprite.scale.set(4.4, 1.25, 1);
    priceBadgeSprite.position.set(45.5, livePriceY, 0.2);
    chartGroup.add(priceBadgeSprite);

    // Trading Signal Badges on both wings
    const createTradingTagTexture = (text, isBuy) => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isBuy ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)';
      ctx.strokeStyle = isBuy ? '#089981' : '#f23645';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(4, 4, 192, 52, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isBuy ? '#089981' : '#f23645';
      ctx.font = 'bold 22px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 100, 30);
      return new THREE.CanvasTexture(canvas);
    };

    const tags = [
      { text: '▲ BUY', isBuy: true, x: -30, y: 1.5 },
      { text: '▼ SELL', isBuy: false, x: -16, y: 8.5 },
      { text: '▲ LONG', isBuy: true, x: 18, y: 3.2 },
      { text: '● HFT', isBuy: true, x: 34, y: 7.8 }
    ];

    tags.forEach((t) => {
      const tex = createTradingTagTexture(t.text, t.isBuy);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9 }));
      sp.scale.set(3.2, 1.0, 1);
      sp.position.set(t.x, t.y, 0.2);
      chartGroup.add(sp);
    });

    scene.add(chartGroup);

    // =========================================================================
    // 5. INTERACTIVE MOUSE PARALLAX & ANIMATION LOOP
    // =========================================================================
    let targetCameraX = 0;
    let targetCameraY = 5;
    let targetChartRotY = 0;

    const handleMouseMove = (event) => {
      const normX = (event.clientX / window.innerWidth) * 2 - 1;
      const normY = -(event.clientY / window.innerHeight) * 2 + 1;

      targetCameraX = normX * 4.5;
      targetCameraY = 5 + normY * 3.0;
      targetChartRotY = normX * 0.04;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth camera interpolation
      camera.position.x += (targetCameraX - camera.position.x) * 0.045;
      camera.position.y += (targetCameraY - camera.position.y) * 0.045;
      camera.lookAt(0, 4, 0);

      chartGroup.rotation.y += (targetChartRotY - chartGroup.rotation.y) * 0.045;

      // Animate 3D Wave Surface at bottom
      const posAttr = particlesGeometry.attributes.position;
      const array = posAttr.array;

      let idx = 0;
      for (let ix = 0; ix < gridCols; ix++) {
        for (let iz = 0; iz < gridRows; iz++) {
          const x = (ix - gridCols / 2) * separation;
          const z = (iz - gridRows / 2) * separation - 4;

          const wave1 = Math.sin(x * 0.09 + elapsedTime * 1.2) * 1.8;
          const wave2 = Math.cos(z * 0.12 + elapsedTime * 0.9) * 1.4;
          const wave3 = Math.sin((x + z) * 0.06 + elapsedTime * 1.4) * 1.1;

          array[idx * 3 + 1] = -6.5 + wave1 + wave2 + wave3;
          idx++;
        }
      }
      posAttr.needsUpdate = true;

      // Animate Upper Constellation Nodes (gentle floating)
      nodePositions.forEach((node, i) => {
        node.mesh.position.x = node.basePos.x + Math.sin(elapsedTime * 0.6 + i) * 1.2;
        node.mesh.position.y = node.basePos.y + Math.cos(elapsedTime * 0.7 + i) * 0.8;
      });

      // Update Constellation connecting lines
      const linePos = netLinesGeo.attributes.position.array;
      let lineIdx = 0;
      for (let k = 0; k < lineIndices.length; k += 2) {
        const nA = nodePositions[lineIndices[k]].mesh.position;
        const nB = nodePositions[lineIndices[k + 1]].mesh.position;
        linePos[lineIdx++] = nA.x;
        linePos[lineIdx++] = nA.y;
        linePos[lineIdx++] = nA.z;
        linePos[lineIdx++] = nB.x;
        linePos[lineIdx++] = nB.y;
        linePos[lineIdx++] = nB.z;
      }
      netLinesGeo.attributes.position.needsUpdate = true;

      // Subtle pulse on live price badge
      const pulse = Math.sin(elapsedTime * 3) * 0.06;
      priceBadgeSprite.scale.set(4.4 + pulse * 2, 1.25 + pulse * 0.6, 1);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      particlesGeometry.dispose();
      particleMaterial.dispose();
      nodeGeo.dispose();
      nodeMatCyan.dispose();
      nodeMatTeal.dispose();
      netLinesGeo.dispose();
      netLinesMat.dispose();

      bullBodyMat.dispose();
      bearBodyMat.dispose();
      wickBullMat.dispose();
      wickBearMat.dispose();
      volBullMat.dispose();
      volBearMat.dispose();

      priceBadgeTexture.dispose();
      badgeSpriteMat.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}
    >
      {/* 3D WebGL Canvas */}
      <Box
        ref={mountRef}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto'
        }}
      />

      {/* Cyber Grid Texture Overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(6, 9, 20, 0.12) 0%, rgba(6, 9, 20, 0.72) 65%, rgba(6, 9, 20, 0.95) 100%),
            linear-gradient(rgba(0, 240, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 36px 36px, 36px 36px',
          pointerEvents: 'none'
        }}
      />

      {/* Atmospheric Aurora Glows (eliminates the pitch black void on Left, Right & Top) */}
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          left: '-5%',
          width: '45%',
          height: '55%',
          background: 'radial-gradient(ellipse at center, rgba(0, 240, 255, 0.09) 0%, rgba(29, 78, 216, 0.05) 50%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '45%',
          height: '55%',
          background: 'radial-gradient(ellipse at center, rgba(8, 153, 129, 0.09) 0%, rgba(0, 240, 255, 0.04) 50%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '0%',
          left: '25%',
          width: '50%',
          height: '35%',
          background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.06) 0%, transparent 70%)',
          filter: 'blur(90px)',
          pointerEvents: 'none'
        }}
      />

      {/* Top Financial Ticker Tape Streaming across the full width */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          bgcolor: 'rgba(6, 9, 20, 0.85)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.14)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          zIndex: 2,
          pointerEvents: 'none'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
            animation: 'tickerSlide 55s linear infinite',
            '@keyframes tickerSlide': {
              '0%': { transform: 'translateX(0)' },
              '100%': { transform: 'translateX(-50%)' }
            }
          }}
        >
          {[...assets, ...assets].map((item, idx) => {
              const isUp = item.change >= 0;
              return (
                <Box key={idx} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                    {item.s}
                  </Box>
                  <Box sx={{ fontSize: '0.72rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                    {formatPrice(item)}
                  </Box>
                  <Box sx={{ fontSize: '0.7rem', fontWeight: 600, color: isUp ? '#089981' : '#f23645', fontFamily: 'monospace' }}>
                    {isUp ? `+${item.change}%` : `${item.change}%`}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>


      {/* Subtle bottom glowing bloom */}
      <Box
        sx={{
          position: 'absolute',
          bottom: '-15%',
          left: '15%',
          width: '70%',
          height: '40%',
          background: 'radial-gradient(ellipse at center, rgba(8, 153, 129, 0.08) 0%, rgba(0, 240, 255, 0.04) 50%, transparent 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none'
        }}
      />
    </Box>
  );
}
