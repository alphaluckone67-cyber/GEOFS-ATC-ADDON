// ==UserScript==
// @name         GeoFS Voice ATC Network
// @namespace    https://github.com
// @version      0.4
// @description  GeoFS-themed Voice ATC Network with live pilot counter, mic toggle, and theme customizer.
// @author       alphaluckone67-cyber
// @match        *://*://*
// @match        *://://geo-fs.com*
// @require      https://unpkg.com
// @grant        none
// ==/UserScript==
/* global Peer */

(function () {
    'use strict';

    const BANNED_WORDS = ["badword1", "badword2", "weirdword"];
    let micMuted = false;
    let isConnected = false;
    let peer = null;
    let localStream = null;
    let connectedPilots = new Set();

    const THEMES = {
        geofs: { bg: 'rgba(24, 28, 32, 0.94)', border: '#3a4149', accent: '#2b6cb0', text: '#f0f4f8' },
        cyber: { bg: 'rgba(13, 12, 34, 0.95)', border: '#ff007f', accent: '#00f0ff', text: '#ffffff' },
        airbus: { bg: 'rgba(10, 25, 47, 0.95)', border: '#38bdf8', accent: '#0284c7', text: '#e0f2fe' },
        radar: { bg: 'rgba(5, 20, 10, 0.95)', border: '#22c55e', accent: '#16a34a', text: '#dcfce7' }
    };

    const panel = document.createElement('div');
    panel.id = 'geofs-atc-panel';
    panel.style.cssText = 'position:fixed; bottom:60px; right:15px; width:250px; background:rgba(24, 28, 32, 0.94); color:#f0f4f8; border:1px solid #3a4149; border-radius:8px; padding:12px; z-index:2147483646; font-family:Arial,sans-serif; box-shadow:0 6px 20px rgba(0,0,0,0.6); display:none;';

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:6px;">
            <span style="font-weight:700; font-size:13px;">🗼 ATC NETWORK</span>
            <div>
                <button id="atc-theme-toggle" title="Customize Panel" style="background:none; border:none; cursor:pointer; font-size:14px;">🎨</button>
                <button id="atc-close" title="Minimize" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px; font-weight:bold;">✕</button>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding:6px 8px; border-radius:5px; margin-bottom:8px; font-size:11px;">
            <span id="atc-net-status" style="color:#f87171; font-weight:bold;">● OFFLINE</span>
            <span id="atc-user-count" style="color:#93c5fd; font-weight:bold;">👥 0 in Network</span>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:8px;">
            <input id="atc-freq-input" type="text" value="118.70" style="width:75px; background:rgba(0,0,0,0.6); color:#4ade80; border:1px solid #555; border-radius:4px; padding:5px; font-weight:bold; text-align:center; font-size:13px;">
            <button id="atc-connect-btn" style="flex:1; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">TUNE FREQ</button>
        </div>
        <button id="atc-mic-btn" style="width:100%; padding:7px; border-radius:5px; border:1px solid rgba(255,255,255,0.2); background:#1f2937; color:#fff; font-weight:bold; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span id="atc-mic-icon">🎙️</span> <span id="atc-mic-text">MIC: READY</span>
        </button>
        <div id="atc-custom-drawer" style="display:none; margin-top:10px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.2); font-size:11px;">
            <div style="margin-bottom:6px; font-weight:bold; color:#cbd5e1;">Panel Style & Theme:</div>
            <select id="atc-theme-select" style="width:100%; padding:4px; background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px; margin-bottom:6px;">
                <option value="geofs">GeoFS Default (Dark Slate)</option>
                <option value="airbus">Airbus Cockpit Blue</option>
                <option value="radar">Radar Green</option>
                <option value="cyber">Neon Cyber</option>
            </select>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>Corner Roundness:</span>
                <input id="atc-radius-slider" type="range" min="0" max="20" value="8" style="width:90px;">
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    function injectMenuButton() {
        if (document.getElementById('atc-mode-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'atc-mode-btn';
        btn.innerHTML = '🗼 ATC MODE';
        btn.onclick = () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (!isConnected) connectToATC();
        };

        const bottomBar = document.querySelector('.geofs-ui-bottom');
        if (bottomBar) {
            btn.className = 'mdl-button mdl-js-button geofs-f-standard-ui';
            btn.style.cssText = 'color: #fff; font-weight: bold; letter-spacing: 0.5px;';
            bottomBar.appendChild(btn);
        } else {
            btn.style.cssText = 'position:fixed; bottom:12px; right:180px; z-index:2147483645; background:rgba(24,28,32,0.9); color:#fff; border:1px solid #555; border-radius:6px; padding:6px 12px; font-weight:bold; cursor:pointer; font-size:12px;';
            document.body.appendChild(btn);
        }
    }

    async function connectToATC() {
        const freqInput = document.getElementById('atc-freq-input');
        const statusEl = document.getElementById('atc-net-status');
        const btnEl = document.getElementById('atc-connect-btn');
        const freq = freqInput.value.trim().replace('.', '-');

        try {
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                startProfanityFilter();
            }

            if (peer) peer.destroy();
            connectedPilots.clear();

            const myId = 'geofs-atc-' + freq + '-' + Math.floor(1000 + Math.random() * 9000);
            peer = new Peer(myId);

            peer.on('open', (id) => {
                isConnected = true;
                connectedPilots.add(id);
                updateUserCount();
                statusEl.textContent = '● CONNECTED (' + freq.replace('-', '.') + ' MHz)';
                statusEl.style.color = '#4ade80';
                btnEl.textContent = 'RE-TUNE';
                updateMicUI();
            });

            peer.on('call', (call) => {
                call.answer(localStream);
                connectedPilots.add(call.peer);
                updateUserCount();
                call.on('stream', (remoteStream) => {
                    const audio = new Audio();
                    audio.srcObject = remoteStream;
                    audio.play();
                });
                call.on('close', () => {
                    connectedPilots.delete(call.peer);
                    updateUserCount();
                });
            });
        } catch (err) {
            statusEl.textContent = '● MIC BLOCKED (Allow Mic)';
            statusEl.style.color = '#f87171';
        }
    }

    function updateUserCount() {
        const countEl = document.getElementById('atc-user-count');
        if (countEl) {
            countEl.textContent = '👥 ' + connectedPilots.size + ' in Network';
        }
    }

    function updateMicUI() {
        const micBtn = document.getElementById('atc-mic-btn');
        const micIcon = document.getElementById('atc-mic-icon');
        const micText = document.getElementById('atc-mic-text');

        if (localStream) {
            localStream.getAudioTracks().forEach(track => { track.enabled = !micMuted; });
        }

        if (micMuted) {
            micBtn.style.background = '#7f1d1d';
            micIcon.textContent = '🔇';
            micText.textContent = 'MIC: MUTED';
        } else {
            micBtn.style.background = '#14532d';
            micIcon.textContent = '🎙️';
            micText.textContent = 'MIC: LIVE';
        }
    }

    function startProfanityFilter() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
            const text = Array.from(e.results).map(r => r.transcript).join('').toLowerCase();
            if (BANNED_WORDS.some(w => text.includes(w)) && !micMuted) {
                micMuted = true;
                updateMicUI();
                setTimeout(() => { micMuted = false; updateMicUI(); }, 3000);
            }
        };
        rec.start();
    }

    document.getElementById('atc-connect-btn').onclick = connectToATC;
    document.getElementById('atc-close').onclick = () => { panel.style.display = 'none'; };
    document.getElementById('atc-mic-btn').onclick = () => {
        micMuted = !micMuted;
        updateMicUI();
    };
    document.getElementById('atc-theme-toggle').onclick = () => {
        const drawer = document.getElementById('atc-custom-drawer');
        drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('atc-theme-select').onchange = (e) => {
        const t = THEMES[e.target.value];
        panel.style.background = t.bg;
        panel.style.borderColor = t.border;
        panel.style.color = t.text;
        const connectBtn = document.getElementById('atc-connect-btn');
        if (connectBtn) { connectBtn.style.background = t.accent; }
    };
    document.getElementById('atc-radius-slider').oninput = (e) => {
        panel.style.borderRadius = e.target.value + 'px';
    };

setTimeout(injectMenuButton, 2000);
setInterval(injectMenuButton, 3000);
})();
