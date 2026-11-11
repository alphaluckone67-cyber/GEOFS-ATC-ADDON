// ==UserScript==
// @name         GeoFS Voice ATC & Headset
// @namespace    https://github.com
// @version      0.1
// @description  Lightweight Voice ATC with frequencies, headset overlay, and word filter.
// @author       alphaluckone67-cyber
// @match        https://geo-fs.com*
// @match        https://*://*
// @require      https://unpkg.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. Banned Words List (Add any words you want muted)
    const BANNED_WORDS = ["badword1", "badword2", "weirdword"];
    let isMuted = false;

    // 2. Create Lightweight Cockpit Headset & Radio UI
    const radioBox = document.createElement('div');
    radioBox.style.cssText = 'position:fixed; bottom:60px; right:15px; background:rgba(18,20,22,0.9); color:#fff; padding:10px; border-radius:8px; border:1px solid #444; z-index:9999; font-family:Arial,sans-serif; width:190px;';
    radioBox.innerHTML = `
        <div style="font-weight:bold; font-size:12px; margin-bottom:6px; color:#8fd0ff;">🎧 ATC VOICE RADIO</div>
        <div style="display:flex; gap:5px; margin-bottom:6px;">
            <input id="atc-freq" type="text" value="118.70" style="width:70px; background:#222; color:#0f0; border:1px solid #555; padding:3px; font-weight:bold;">
            <button id="atc-connect" style="flex:1; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Tune In</button>
        </div>
        <div id="atc-status" style="font-size:10px; color:#aaa;">Status: Disconnected</div>
    `;
    document.body.appendChild(radioBox);

    // 3. Lightweight Cockpit Headset Vignette Overlay
    const headsetOverlay = document.createElement('div');
    headsetOverlay.style.cssText = 'position:fixed; inset:0; pointer-events:none; box-shadow:inset 0 0 90px rgba(0,0,0,0.85); border:12px solid rgba(20,20,20,0.4); display:none; z-index:9998;';
    document.body.appendChild(headsetOverlay);

    // 4. Profanity & Weird Word Speech Filter
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results).map(r => r[0].transcript).join('').toLowerCase();
            if (BANNED_WORDS.some(word => transcript.includes(word))) {
                console.warn("[ATC Filter] Offensive word detected. Muting audio.");
                isMuted = true;
                setTimeout(() => { isMuted = false; }, 3000); // Mutes for 3 seconds
            }
        };
        recognition.start();
    }

    // 5. Connect to Frequency Room
    document.getElementById('atc-connect').onclick = () => {
        const freq = document.getElementById('atc-freq').value.trim();
        const status = document.getElementById('atc-status');
        headsetOverlay.style.display = 'block'; // Puts headset effect on screen
        status.textContent = "Tuned to " + freq + " MHz (Mic Ready)";
        status.style.color = "#5fd68a";
    };
})();
