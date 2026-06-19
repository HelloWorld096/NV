// ==UserScript==
// @name         Sign-Up Automator (Pre-fetched Email)
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Pre-fetches mail.tm credentials concurrently on initialization to remove setup latency
// @author       YourName
// @match        https://www.reddit.com/login/*
// @updateURL    https://raw.githubusercontent.com/HelloWorld096/NV/refs/heads/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/HelloWorld096/NV/refs/heads/main/script.user.js
// @grant        GM_xmlhttpRequest
// @connect      api.mail.tm
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let clickedSignUp = false;
    let emailFilled = false;
    let emailProvisioningStarted = false;
    let clickedFirstContinue = false;
    let usernameTracked = false;
    let passwordFilled = false;
    let clickedFinalContinue = false; 
    let finalSubmitAttempted = false;
    let otpFilled = false;

    let registeredUsername = '';
    const staticPassword = "Asdf//1234";

    let accountCredentials = {
        address: '',
        password: '',
        token: ''
    };

    // Hide trailing icon elements immediately
    const styleBlock = document.createElement('style');
    styleBlock.textContent = `span[slot="trailingIconButton"] { display: none !important; }`;
    (document.head || document.documentElement).appendChild(styleBlock);

    function backgroundRequest(url, method = 'GET', data = null, token = null) {
        return new Promise((resolve, reject) => {
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const config = {
                method: method,
                url: url,
                headers: headers,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(JSON.parse(response.responseText));
                    } else {
                        reject(new Error(`API Error: ${response.status}`));
                    }
                },
                onerror: (err) => reject(err)
            };

            if (method === 'POST' && data) {
                config.data = JSON.stringify(data);
            }

            GM_xmlhttpRequest(config);
        });
    }

    // CONCURRENT BACKGROUND WORKER: Start generating the email immediately on initialization
    const emailPreFetchPromise = (async () => {
        console.log("[Automator] Core initialized. Pre-fetching mail infrastructure concurrently...");
        try {
            const domainData = await backgroundRequest('https://api.mail.tm/domains', 'GET');
            const domain = domainData['hydra:member']?.[0]?.domain;
            if (!domain) throw new Error("API domains down.");

            const user = 'user_' + Math.random().toString(36).substring(2, 11);
            const address = `${user}@${domain}`;
            const password = Math.random().toString(36).substring(2, 15);

            await backgroundRequest('https://api.mail.tm/accounts', 'POST', { address, password });
            const tokenData = await backgroundRequest('https://api.mail.tm/token', 'POST', { address, password });
            
            console.log(`[Automator] Background Inbox successfully created and allocated: ${address}`);
            return { address, password, token: tokenData.token };
        } catch (err) {
            console.error("[Automator] Background pre-fetch execution failure:", err);
            throw err;
        }
    })();

    function executeThrottledSubmit() {
        console.log("[Automator] Transitioning to throttled verification processing flow...");

        const processStep = () => {
            const onboardingTarget = document.querySelector('shreddit-slotter[slot-name="onboarding_gender_collection"]') || 
                                     document.querySelector('[slot-name*="onboarding"]') ||
                                     document.querySelector('shreddit-slotter');

            if (onboardingTarget) {
                console.log("[Automator] Onboarding layout confirmed. Bypassing registration panels...");
                window.location.replace("https://www.reddit.com");
                return;
            }

            const finalSubmitBtn = document.getElementById('email-verification-submit') || document.querySelector('button[form="email-verify"]');
            
            if (finalSubmitBtn) {
                console.log("[Automator] Triggering single calculated verification submission click...");
                finalSubmitBtn.click();
                setTimeout(processStep, 2500);
            } else {
                console.log("[Automator] Verification button dismissed natively. Relocating to dashboard index...");
                window.location.replace("https://www.reddit.com");
            }
        };

        processStep();
    }

    const monitorInterval = setInterval(async () => {
        // --- PHASE 1: Sign Up Toggle ---
        if (!clickedSignUp) {
            const registerLink = document.querySelector('auth-flow-link[step="register"]');
            if (registerLink) {
                const innerBtn = registerLink.querySelector('div[actioned]') || registerLink;
                innerBtn.click();
                clickedSignUp = true;
                console.log("[Automator] Switched to Sign Up layout.");
            }
        }

        // --- PHASE 2: Email Configuration ---
        if (clickedSignUp && !emailFilled && !emailProvisioningStarted) {
            const emailWrapper = document.getElementById('register-email') || document.querySelector('faceplate-text-input[name="email"]');
            if (emailWrapper && emailWrapper.shadowRoot) {
                const hiddenInput = emailWrapper.shadowRoot.querySelector('input');
                if (hiddenInput) {
                    emailProvisioningStarted = true; 
                    console.log("[Automator] Form layer visible. Awaiting background pre-fetch resolution...");
                    
                    try {
                        const preFetchedData = await emailPreFetchPromise;
                        
                        accountCredentials.address = preFetchedData.address;
                        accountCredentials.password = preFetchedData.password;
                        accountCredentials.token = preFetchedData.token;

                        hiddenInput.value = accountCredentials.address;
                        emailWrapper.value = accountCredentials.address;

                        ['input', 'change', 'blur'].forEach(evtName => {
                            const customEvt = new Event(evtName, { bubbles: true, cancelable: true, composed: true });
                            hiddenInput.dispatchEvent(customEvt);
                            emailWrapper.dispatchEvent(customEvt);
                        });

                        console.log(`[Automator] Form populated with pre-fetched inbox: ${accountCredentials.address}`);
                        emailFilled = true;
                    } catch (e) {
                        // Reset flag to try generating a backup if concurrent creation errored out
                        emailProvisioningStarted = false;
                    }
                }
            }
        }

        // --- PHASE 3: Capture Username & Inject Password ---
        if (emailFilled && (!usernameTracked || !passwordFilled)) {
            const userWrapper = document.getElementById('register-username') || document.querySelector('faceplate-text-input[name="username"]');
            const passWrapper = document.getElementById('register-password') || document.querySelector('faceplate-text-input[name="password"]');

            if (userWrapper && !usernameTracked) {
                const discoveredUser = userWrapper.value || userWrapper.getAttribute('value');
                if (discoveredUser && discoveredUser.trim() !== "") {
                    registeredUsername = discoveredUser.trim();
                    console.log(`[Automator] SAVED USERNAME: ${registeredUsername}`);
                    usernameTracked = true;
                }
            }

            if (passWrapper && passWrapper.shadowRoot && !passwordFilled) {
                const hiddenPassInput = passWrapper.shadowRoot.querySelector('input');
                if (hiddenPassInput) {
                    hiddenPassInput.value = staticPassword;
                    passWrapper.value = staticPassword;

                    ['input', 'change', 'blur'].forEach(evtName => {
                        const evt = new Event(evtName, { bubbles: true, cancelable: true, composed: true });
                        hiddenPassInput.dispatchEvent(evt);
                        passWrapper.dispatchEvent(evt);
                    });

                    console.log("[Automator] Fixed prefix password injected.");
                    passwordFilled = true;
                }
            }
        }

        // --- PHASE 4: Original Primary Continue (Screen 1) ---
        if (emailFilled && passwordFilled && usernameTracked && !clickedFirstContinue) {
            const firstContinueBtn = document.querySelector('div[slot="primaryButton"] button.continue') || document.querySelector('button.continue');
            if (firstContinueBtn && !firstContinueBtn.disabled) {
                firstContinueBtn.click();
                clickedFirstContinue = true;
                console.log("[Automator] Screen 1 Continue clicked.");
            }
        }

        // --- PHASE 5: New Final Continue (Screen 2 - After Username/Pass) ---
        if (clickedFirstContinue && !clickedFinalContinue) {
            const finalContinueBtn = document.querySelector('div[slot="primaryButton"] button.create') || document.querySelector('button[type="submit"].create');
            if (finalContinueBtn && !finalContinueBtn.disabled) {
                finalContinueBtn.click();
                clickedFinalContinue = true; 
                console.log("[Automator] Final Continue (.create) clicked. Starting OTP poll...");
                startOtpPollingFlow();
            }
        }

        // --- PHASE 6: Transition to Throttled Action Sequence ---
        if (otpFilled && !finalSubmitAttempted) {
            finalSubmitAttempted = true;
            clearInterval(monitorInterval); 
            executeThrottledSubmit();       
        }
    }, 300);

    function startOtpPollingFlow() {
        const otpPollInterval = setInterval(async () => {
            if (otpFilled) {
                clearInterval(otpPollInterval);
                return;
            }

            try {
                const messagesData = await backgroundRequest('https://api.mail.tm/messages', 'GET', null, accountCredentials.token);
                const messages = messagesData['hydra:member'] || [];

                if (messages.length > 0) {
                    const latestMessage = messages[0];
                    const searchString = (latestMessage.subject + " " + latestMessage.intro).toLowerCase();
                    const match = searchString.match(/\b\d{6}\b/);
                    
                    if (match) {
                        const otpCode = match[0];
                        console.log(`[Automator] Verification sequence matching: ${otpCode}`);
                        clearInterval(otpPollInterval);
                        fillOtpField(otpCode);
                    }
                }
            } catch (err) {
                console.error("[Automator] Inbox scanning fault:", err);
            }
        }, 3000);
    }

    function fillOtpField(code) {
        const otpWrapper = document.querySelector('faceplate-text-input[name="code"]');
        if (otpWrapper && otpWrapper.shadowRoot) {
            const innerOtpInput = otpWrapper.shadowRoot.querySelector('input');
            if (innerOtpInput) {
                innerOtpInput.value = code;
                otpWrapper.value = code;

                ['input', 'change', 'blur'].forEach(evtName => {
                    const customEvt = new Event(evtName, { bubbles: true, cancelable: true, composed: true });
                    innerOtpInput.dispatchEvent(customEvt);
                    otpWrapper.dispatchEvent(customEvt);
                });

                console.log("[Automator] Secure credentials passed to view layer.");
                otpFilled = true;
            }
        }
    }
})();
