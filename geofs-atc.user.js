// ==UserScript==
// @name         GeoFS Voice ATC Network
// @namespace    https://github.com
// @version      0.6
// @description  Ultra-lightweight Voice ATC Network with guaranteed UI loading.
// @author       alphaluckone67-cyber
// @match        *://*://*
// @match        *://://geo-fs.com*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const BANNED_WORDS = ["badword1", "badword2", "weirdword"];
    let micMuted = false;
    let isConnected = false;
    let peer = null;
    let localStream = null;
    let connectedPilots = new Set();

    const THEMES = {
        geofs: { bg: '#181c20', border: '#3a4149', accent: '#2b6cb0', text: '#f0f4f8' },
        airbus: { bg: '#0a192f', border: '#38bdf8', accent: '#0284c7', text: '#e0f2fe' },
        radar: { bg: '#05140a', border: '#22c55e', accent: '#16a34a', text: '#dcfce7' },
        cyber: { bg: '#0d0c22', border: '#ff007f', accent: '#00f0ff', text: '#ffffff' }
    };

    // Safely load PeerJS in the background without blocking the UI
    function loadPeerJS() {
        return new Promise((resolve, reject) => {
            if (window.Peer) return resolve(window.Peer);
            const script = document.createElement('script');
            script.src = 'https://jsdelivr.net';
            script.onload = () => resolve(window.Peer);
            script.onerror = () => reject(new Error('PeerJS blocked by network'));
            document.head.appendChild(script);
        });
    }

    function buildATCInterface() {
        if (document.getElementById('atc-mode-btn')) return;

        // 1. Create Panel
        const panel = document.createElement('div');
        panel.id = 'geofs-atc-panel';
        panel.style.cssText = 'position:fixed; bottom:60px; right:15px; width:245px; background:#181c20; color:#f0f4f8; border:1px solid #3a4149; border-radius:8px; padding:12px; z-index:2147483646; font-family:Arial,sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.6); display:none;';

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2d333b; padding-bottom:6px;">
                <span style="font-weight:700; font-size:13px;">🗼 ATC NETWORK</span>
                <div>
                    <button id="atc-theme-toggle" title="Theme" style="background:none; border:none; cursor:pointer; font-size:14px;">🎨</button>
                    <button id="atc-close" title="Close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px; font-weight:bold;">✕</button>
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; background:#101316; padding:6px 8px; border-radius:4px; margin-bottom:8px; font-size:11px;">
                <span id="atc-net-status" style="color:#f87171; font-weight:bold;">● OFFLINE</span>
                <span id="atc-user-count" style="color:#93c5fd; font-weight:bold;">👥 0 in Network</span>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px;">
                <input id="atc-freq-input" type="text" value="118.70" style="width:75px; background:#101316; color:#4ade80; border:1px solid #444; border-radius:4px; padding:5px; font-weight:bold; text-align:center; font-size:13px;">
                <button id="atc-connect-btn" style="flex:1; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">TUNE FREQ</button>
            </div>
            <button id="atc-mic-btn" style="width:100%; padding:7px; border-radius:4px; border:1px solid #333; background:#1f2937; color:#fff; font-weight:bold; cursor:pointer; font-size:12px;">
                🎙️ MIC: READY
            </button>
            <div id="atc-custom-drawer" style="display:none; margin-top:10px; padding-top:8px; border-top:1px dashed #333; font-size:11px;">
                <select id="atc-theme-select" style="width:100%; padding:4px; background:#101316; color:#fff; border:1px solid #444; border-radius:4px; margin-bottom:6px;">
                    <option value="geofs">GeoFS Default</option>
                    <option value="airbus">Airbus Blue</option>
                    <option value="radar">Radar Green</option>
                    <option value="cyber">Neon Cyber</option>
                </select>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Corners:</span>
                    <input id="atc-radius-slider" type="range" min="0" max="20" value="8" style="width:90px;">
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 2. Create Bottom Button
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
            btn.style.cssText = 'color:#fff; font-weight:bold;';
            bottomBar.appendChild(btn);
        } else {
            btn.style.cssText = 'position:fixed; bottom:12px; right:180px; z-index:2147483645; background:#181c20; color:#fff; border:1px solid #444; border-radius:6px; padding:6px 12px; font-weight:bold; cursor:pointer; font-size:12px;';
            document.body.appendChild(btn);
        }

        // 3. Controls & Voice Logic
        const connectBtn = document.getElementById('atc-connect-btn');
        const micBtn = document.getElementById('atc-mic-btn');
        const statusEl = document.getElementById('atc-net-status');
        const countEl = document.getElementById('atc-user-count');

        function updateCount() {
            countEl.textContent = '👥 ' + connectedPilots.size + ' in Network';
        }

        function updateMic() {
            if (localStream) {
                localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
            }
            micBtn.style.background = micMuted ? '#7f1d1d' : '#14532d';
            micBtn.textContent = micMuted ? '🔇 MIC: MUTED' : '🎙️ MIC: LIVE';
        }

        async function connectToATC() {
            const freq = document.getElementById('atc-freq-input').value.trim().replace('.', '-');
            statusEl.textContent = '● CONNECTING...';
            statusEl.style.color = '#facc15';

            try {
                const PeerClass = await loadPeerJS();
                if (!localStream) {
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                    startFilter();
                }
                if (peer) peer.destroy();
                connectedPilots.clear();

                peer = new PeerClass('geofs-atc-' + freq + '-' + Math.floor(1000 + Math.random() * 9000));
                peer.on('open', (id) => {
                    isConnected = true;
                    connectedPilots.add(id);
                    updateCount();
                    statusEl.textContent = '● LIVE (' + freq.replace('-', '.') + ')';
                    statusEl.style.color = '#4ade80';
                    connectBtn.textContent = 'RE-TUNE';
                    updateMic();
                });

                peer.on('call', (call) => {
                    call.answer(localStream);
                    connectedPilots.add(call.peer);
                    updateCount();
                    call.on('stream', (stream) => {
                        const a = new Audio();
                        a.srcObject = stream;
                        a.play();
                    });
                    call.on('close', () => {
                        connectedPilots.delete(call.peer);
                        updateCount();
                    });
                });
            } catch (err) {
                statusEl.textContent = '● ' + (err.message || 'MIC BLOCKED');
                statusEl.style.color = '#f87171';
            }
        }

        function startFilter() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) return;
            const rec = new SR();
            rec.continuous = true;
            rec.onresult = (e) => {
                const txt = Array.from(e.results).map(r => r.transcript).join('').toLowerCase();
                if (BANNED_WORDS.some(w => txt.includes(w)) && !micMuted) {
                    micMuted = true;
                    updateMic();
                    setTimeout(() => { micMuted = false; updateMic(); }, 3000);
                }
            };
            rec.start();
        }

        connectBtn.onclick = connectToATC;
        document.getElementById('atc-close').onclick = () => { panel.style.display = 'none'; };
        micBtn.onclick = () => { micMuted = !micMuted; updateMic(); };
        document.getElementById('atc-theme-toggle').onclick = () => {
            const d = document.getElementById('atc-custom-drawer');
            d.style.display = d.style.display === 'none' ? 'block' : 'none';
        };
        document.getElementById('atc-theme-select').onchange = (e) => {
            const t = THEMES[e.target.value];
            panel.style.background = t.bg;
            panel.style.borderColor = t.border;
            panel.style.color = t.text;
            connectBtn.style.background = t.accent;
        };
        document.getElementById('atc-radius-slider').oninput = (e) => {
            panel.style.borderRadius = e.target.value + 'px';
        };
    }

    // Run immediately if page is already loaded, otherwise wait for load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
setTimeout(buildATCInterface, 1500);
} else {
window.addEventListener('DOMContentLoaded', () => setTimeout(buildATCInterface, 1500));
}
})();
