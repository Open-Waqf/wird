(() => {
    var st = Object.defineProperty;
    var D = (s, t) => () => (s && (t = s(s = 0)), t);
    var ot = (s, t) => () => (t || s((t = {
        exports: {}
    }).exports, t), t.exports), be = (s, t) => {
        for (var r in t) st(s, r, {
            get: t[r],
            enumerable: !0
        });
    };
    var te, ne, it, ct, lt, de, ae, Y, Se, ke, ue, vt, dt, ut, gt, ft, ge, wt, xe, Ce, fe, bt, pe = D(() => {
        (function(s) {
            s.Unimplemented = "UNIMPLEMENTED", s.Unavailable = "UNAVAILABLE";
        })(te || (te = {}));
        ne = class extends Error {
            constructor(t, r, e) {
                super(t), this.message = t, this.code = r, this.data = e;
            }
        }, it = s => {
            var t, r;
            return s?.androidBridge ? "android" : !((r = (t = s?.webkit) === null || t === void 0 ? void 0 : t.messageHandlers) === null || r === void 0) && r.bridge ? "ios" : "web";
        }, ct = s => {
            let t = s.CapacitorCustomPlatform || null, r = s.Capacitor || {}, e = r.Plugins = r.Plugins || {}, a = () => t !== null ? t.name : it(s), n = () => a() !== "web", o = u => {
                let g = l.get(u);
                return !!(g?.platforms.has(a()) || i(u));
            }, i = u => {
                var g;
                return (g = r.PluginHeaders) === null || g === void 0 ? void 0 : g.find(m => m.name === u);
            }, c = u => s.console.error(u), l = new Map, d = (u, g = {}) => {
                let m = l.get(u);
                if (m) return console.warn(`Capacitor plugin "${u}" already registered. Cannot register plugins twice.`), 
                m.proxy;
                let y = a(), S = i(u), h, p = async () => (!h && y in g ? h = typeof g[y] == "function" ? h = await g[y]() : h = g[y] : t !== null && !h && "web" in g && (h = typeof g.web == "function" ? h = await g.web() : h = g.web), 
                h), b = (U, v) => {
                    var k, M;
                    if (S) {
                        let T = S?.methods.find(P => v === P.name);
                        if (T) return T.rtype === "promise" ? P => r.nativePromise(u, v.toString(), P) : (P, H) => r.nativeCallback(u, v.toString(), P, H);
                        if (U) return (k = U[v]) === null || k === void 0 ? void 0 : k.bind(U);
                    } else {
                        if (U) return (M = U[v]) === null || M === void 0 ? void 0 : M.bind(U);
                        throw new ne(`"${u}" plugin is not implemented on ${y}`, te.Unimplemented);
                    }
                }, E = U => {
                    let v, k = (...M) => {
                        let T = p().then(P => {
                            let H = b(P, U);
                            if (H) {
                                let N = H(...M);
                                return v = N?.remove, N;
                            } else throw new ne(`"${u}.${U}()" is not implemented on ${y}`, te.Unimplemented);
                        });
                        return U === "addListener" && (T.remove = async () => v()), T;
                    };
                    return k.toString = () => `${U.toString()}() { [capacitor code] }`, Object.defineProperty(k, "name", {
                        value: U,
                        writable: !1,
                        configurable: !1
                    }), k;
                }, F = E("addListener"), _ = E("removeListener"), W = (U, v) => {
                    let k = F({
                        eventName: U
                    }, v), M = async () => {
                        let P = await k;
                        _({
                            eventName: U,
                            callbackId: P
                        }, v);
                    }, T = new Promise(P => k.then(() => P({
                        remove: M
                    })));
                    return T.remove = async () => {
                        console.warn("Using addListener() without 'await' is deprecated."), await M();
                    }, T;
                }, J = new Proxy({}, {
                    get(U, v) {
                        switch (v) {
                          case "$$typeof":
                            return;

                          case "toJSON":
                            return () => ({});

                          case "addListener":
                            return S ? W : F;

                          case "removeListener":
                            return _;

                          default:
                            return E(v);
                        }
                    }
                });
                return e[u] = J, l.set(u, {
                    name: u,
                    proxy: J,
                    platforms: new Set([ ...Object.keys(g), ...S ? [ y ] : [] ])
                }), J;
            };
            return r.convertFileSrc || (r.convertFileSrc = u => u), r.getPlatform = a, r.handleError = c, 
            r.isNativePlatform = n, r.isPluginAvailable = o, r.registerPlugin = d, r.Exception = ne, 
            r.DEBUG = !!r.DEBUG, r.isLoggingEnabled = !!r.isLoggingEnabled, r;
        }, lt = s => s.Capacitor = ct(s), de = lt(typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {}), 
        ae = de.registerPlugin, Y = class {
            constructor() {
                this.listeners = {}, this.retainedEventArguments = {}, this.windowListeners = {};
            }
            addListener(t, r) {
                let e = !1;
                this.listeners[t] || (this.listeners[t] = [], e = !0), this.listeners[t].push(r);
                let n = this.windowListeners[t];
                n && !n.registered && this.addWindowListener(n), e && this.sendRetainedArgumentsForEvent(t);
                let o = async () => this.removeListener(t, r);
                return Promise.resolve({
                    remove: o
                });
            }
            async removeAllListeners() {
                this.listeners = {};
                for (let t in this.windowListeners) this.removeWindowListener(this.windowListeners[t]);
                this.windowListeners = {};
            }
            notifyListeners(t, r, e) {
                let a = this.listeners[t];
                if (!a) {
                    if (e) {
                        let n = this.retainedEventArguments[t];
                        n || (n = []), n.push(r), this.retainedEventArguments[t] = n;
                    }
                    return;
                }
                a.forEach(n => n(r));
            }
            hasListeners(t) {
                var r;
                return !!(!((r = this.listeners[t]) === null || r === void 0) && r.length);
            }
            registerWindowListener(t, r) {
                this.windowListeners[r] = {
                    registered: !1,
                    windowEventName: t,
                    pluginEventName: r,
                    handler: e => {
                        this.notifyListeners(r, e);
                    }
                };
            }
            unimplemented(t = "not implemented") {
                return new de.Exception(t, te.Unimplemented);
            }
            unavailable(t = "not available") {
                return new de.Exception(t, te.Unavailable);
            }
            async removeListener(t, r) {
                let e = this.listeners[t];
                if (!e) return;
                let a = e.indexOf(r);
                this.listeners[t].splice(a, 1), this.listeners[t].length || this.removeWindowListener(this.windowListeners[t]);
            }
            addWindowListener(t) {
                window.addEventListener(t.windowEventName, t.handler), t.registered = !0;
            }
            removeWindowListener(t) {
                t && (window.removeEventListener(t.windowEventName, t.handler), t.registered = !1);
            }
            sendRetainedArgumentsForEvent(t) {
                let r = this.retainedEventArguments[t];
                r && (delete this.retainedEventArguments[t], r.forEach(e => {
                    this.notifyListeners(t, e);
                }));
            }
        }, Se = s => encodeURIComponent(s).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape), 
        ke = s => s.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent), ue = class extends Y {
            async getCookies() {
                let t = document.cookie, r = {};
                return t.split(";").forEach(e => {
                    if (e.length <= 0) return;
                    let [a, n] = e.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
                    a = ke(a).trim(), n = ke(n).trim(), r[a] = n;
                }), r;
            }
            async setCookie(t) {
                try {
                    let r = Se(t.key), e = Se(t.value), a = `; expires=${(t.expires || "").replace("expires=", "")}`, n = (t.path || "/").replace("path=", ""), o = t.url != null && t.url.length > 0 ? `domain=${t.url}` : "";
                    document.cookie = `${r}=${e || ""}${a}; path=${n}; ${o};`;
                } catch (r) {
                    return Promise.reject(r);
                }
            }
            async deleteCookie(t) {
                try {
                    document.cookie = `${t.key}=; Max-Age=0`;
                } catch (r) {
                    return Promise.reject(r);
                }
            }
            async clearCookies() {
                try {
                    let t = document.cookie.split(";") || [];
                    for (let r of t) document.cookie = r.replace(/^ +/, "").replace(/=.*/, `=;expires=${(new Date).toUTCString()};path=/`);
                } catch (t) {
                    return Promise.reject(t);
                }
            }
            async clearAllCookies() {
                try {
                    await this.clearCookies();
                } catch (t) {
                    return Promise.reject(t);
                }
            }
        }, vt = ae("CapacitorCookies", {
            web: () => new ue
        }), dt = async s => new Promise((t, r) => {
            let e = new FileReader;
            e.onload = () => {
                let a = e.result;
                t(a.indexOf(",") >= 0 ? a.split(",")[1] : a);
            }, e.onerror = a => r(a), e.readAsDataURL(s);
        }), ut = (s = {}) => {
            let t = Object.keys(s);
            return Object.keys(s).map(a => a.toLocaleLowerCase()).reduce((a, n, o) => (a[n] = s[t[o]], 
            a), {});
        }, gt = (s, t = !0) => s ? Object.entries(s).reduce((e, a) => {
            let [n, o] = a, i, c;
            return Array.isArray(o) ? (c = "", o.forEach(l => {
                i = t ? encodeURIComponent(l) : l, c += `${n}=${i}&`;
            }), c.slice(0, -1)) : (i = t ? encodeURIComponent(o) : o, c = `${n}=${i}`), `${e}&${c}`;
        }, "").substr(1) : null, ft = (s, t = {}) => {
            let r = Object.assign({
                method: s.method || "GET",
                headers: s.headers
            }, t), a = ut(s.headers)["content-type"] || "";
            if (typeof s.data == "string") r.body = s.data; else if (a.includes("application/x-www-form-urlencoded")) {
                let n = new URLSearchParams;
                for (let [o, i] of Object.entries(s.data || {})) n.set(o, i);
                r.body = n.toString();
            } else if (a.includes("multipart/form-data") || s.data instanceof FormData) {
                let n = new FormData;
                if (s.data instanceof FormData) s.data.forEach((i, c) => {
                    n.append(c, i);
                }); else for (let i of Object.keys(s.data)) n.append(i, s.data[i]);
                r.body = n;
                let o = new Headers(r.headers);
                o.delete("content-type"), r.headers = o;
            } else (a.includes("application/json") || typeof s.data == "object") && (r.body = JSON.stringify(s.data));
            return r;
        }, ge = class extends Y {
            async request(t) {
                let r = ft(t, t.webFetchExtra), e = gt(t.params, t.shouldEncodeUrlParams), a = e ? `${t.url}?${e}` : t.url, n = await fetch(a, r), o = n.headers.get("content-type") || "", {responseType: i = "text"} = n.ok ? t : {};
                o.includes("application/json") && (i = "json");
                let c, l;
                switch (i) {
                  case "arraybuffer":
                  case "blob":
                    l = await n.blob(), c = await dt(l);
                    break;

                  case "json":
                    c = await n.json();
                    break;

                  default:
                    c = await n.text();
                }
                let d = {};
                return n.headers.forEach((u, g) => {
                    d[g] = u;
                }), {
                    data: c,
                    headers: d,
                    status: n.status,
                    url: n.url
                };
            }
            async get(t) {
                return this.request(Object.assign(Object.assign({}, t), {
                    method: "GET"
                }));
            }
            async post(t) {
                return this.request(Object.assign(Object.assign({}, t), {
                    method: "POST"
                }));
            }
            async put(t) {
                return this.request(Object.assign(Object.assign({}, t), {
                    method: "PUT"
                }));
            }
            async patch(t) {
                return this.request(Object.assign(Object.assign({}, t), {
                    method: "PATCH"
                }));
            }
            async delete(t) {
                return this.request(Object.assign(Object.assign({}, t), {
                    method: "DELETE"
                }));
            }
        }, wt = ae("CapacitorHttp", {
            web: () => new ge
        });
        (function(s) {
            s.Dark = "DARK", s.Light = "LIGHT", s.Default = "DEFAULT";
        })(xe || (xe = {}));
        (function(s) {
            s.StatusBar = "StatusBar", s.NavigationBar = "NavigationBar";
        })(Ce || (Ce = {}));
        fe = class extends Y {
            async setStyle() {
                this.unavailable("not available for web");
            }
            async setAnimation() {
                this.unavailable("not available for web");
            }
            async show() {
                this.unavailable("not available for web");
            }
            async hide() {
                this.unavailable("not available for web");
            }
        }, bt = ae("SystemBars", {
            web: () => new fe
        });
    });
    var X, Z, he = D(() => {
        (function(s) {
            s.Heavy = "HEAVY", s.Medium = "MEDIUM", s.Light = "LIGHT";
        })(X || (X = {}));
        (function(s) {
            s.Success = "SUCCESS", s.Warning = "WARNING", s.Error = "ERROR";
        })(Z || (Z = {}));
    });
    var Le = {};
    be(Le, {
        HapticsWeb: () => me
    });
    var me, Ee = D(() => {
        pe();
        he();
        me = class extends Y {
            constructor() {
                super(...arguments), this.selectionStarted = !1;
            }
            async impact(t) {
                let r = this.patternForImpact(t?.style);
                this.vibrateWithPattern(r);
            }
            async notification(t) {
                let r = this.patternForNotification(t?.type);
                this.vibrateWithPattern(r);
            }
            async vibrate(t) {
                let r = t?.duration || 300;
                this.vibrateWithPattern([ r ]);
            }
            async selectionStart() {
                this.selectionStarted = !0;
            }
            async selectionChanged() {
                this.selectionStarted && this.vibrateWithPattern([ 70 ]);
            }
            async selectionEnd() {
                this.selectionStarted = !1;
            }
            patternForImpact(t = X.Heavy) {
                return t === X.Medium ? [ 43 ] : t === X.Light ? [ 20 ] : [ 61 ];
            }
            patternForNotification(t = Z.Success) {
                return t === Z.Warning ? [ 30, 40, 30, 50, 60 ] : t === Z.Error ? [ 27, 45, 50 ] : [ 35, 65, 21 ];
            }
            vibrateWithPattern(t) {
                if (navigator.vibrate) navigator.vibrate(t); else throw this.unavailable("Browser does not support the vibrate API");
            }
        };
    });
    var _e = {};
    be(_e, {
        Haptics: () => pt,
        ImpactStyle: () => X,
        NotificationType: () => Z
    });
    var pt, Ae = D(() => {
        pe();
        he();
        pt = ae("Haptics", {
            web: () => Promise.resolve().then(() => (Ee(), Le)).then(s => new s.HapticsWeb)
        });
    });
    function Te(s) {
        let t = null, r = {
            light: [ "LIGHT", "light" ],
            medium: [ "MEDIUM", "medium" ],
            heavy: [ "HEAVY", "heavy" ]
        };
        function e() {
            return window.Capacitor?.Plugins?.Haptics || null;
        }
        async function a() {
            return t || (t = (async () => {
                let i = e();
                if (i) return i;
                try {
                    return (await Promise.resolve().then(() => (Ae(), _e)))?.Haptics || null;
                } catch {
                    return null;
                }
            })(), t);
        }
        async function n(i, c) {
            if (!s()) return;
            let l = await a();
            if (l?.impact) for (let d of i) try {
                await l.impact({
                    style: d
                });
                return;
            } catch {}
            navigator.vibrate && navigator.vibrate(c);
        }
        async function o(i) {
            if (!s()) return;
            let c = await a();
            if (c?.vibrate) try {
                await c.vibrate({
                    duration: i
                });
                return;
            } catch {
                try {
                    await c.vibrate();
                    return;
                } catch {}
            }
            navigator.vibrate && navigator.vibrate(i);
        }
        return {
            lightTap() {
                n(r.light, 10);
            },
            milestoneThump() {
                n(r.medium, 40);
            },
            completionPulse() {
                o(300);
            },
            celebrationSequence() {
                (async () => (await n(r.heavy, 60), setTimeout(async () => await n(r.medium, 40), 150), 
                setTimeout(async () => await n(r.light, 20), 300)))();
            },
            pulseMs(i) {
                o(i);
            }
        };
    }
    var Ie = D(() => {});
    var A, ye = D(() => {
        A = {
            _cache: {},
            async loadAll() {
                let t = window.Capacitor?.Plugins?.Preferences;
                if (t) try {
                    let {keys: r} = await t.keys();
                    for (let e of r) {
                        let {value: a} = await t.get({
                            key: e
                        });
                        this._cache[e] = a;
                    }
                } catch (r) {
                    console.error("Failed to load preferences:", r);
                } else for (let r = 0; r < localStorage.length; r++) {
                    let e = localStorage.key(r);
                    this._cache[e] = localStorage.getItem(e);
                }
            },
            get(s) {
                return this._cache[s] || null;
            },
            async set(s, t) {
                this._cache[s] = String(t);
                let e = window.Capacitor?.Plugins?.Preferences;
                e ? await e.set({
                    key: s,
                    value: String(t)
                }) : localStorage.setItem(s, String(t));
            },
            async remove(s) {
                delete this._cache[s];
                let r = window.Capacitor?.Plugins?.Preferences;
                r ? await r.remove({
                    key: s
                }) : localStorage.removeItem(s);
            },
            async migrate() {
                let s = window.Capacitor, t = s?.Plugins?.Preferences;
                if (!t || !s.isNativePlatform()) return;
                let r = "wird_storage_migrated", {value: e} = await t.get({
                    key: r
                });
                if (e !== "true") {
                    console.log("🚀 Starting storage migration...");
                    for (let a = 0; a < localStorage.length; a++) {
                        let n = localStorage.key(a);
                        if (n === r) continue;
                        let o = localStorage.getItem(n);
                        await t.set({
                            key: n,
                            value: o
                        });
                    }
                    localStorage.clear(), await t.set({
                        key: r,
                        value: "true"
                    }), console.log("✅ Storage migration complete.");
                }
            }
        };
    });
    function Pe(s) {
        return {
            getStorageKey(t) {
                let {App: r} = s();
                return `${r.currentCategory}_${t}`;
            },
            getStorageKeyForCategory(t, r) {
                return `${t}_${r}`;
            },
            getProgressCategoryForItem(t) {
                let {App: r, MAIN_CATEGORIES: e} = s();
                if (r.currentCategory !== "favorites") return r.currentCategory;
                let a = Array.isArray(t.category) ? t.category : [ t.category ];
                return a.find(o => e.includes(o)) || a[0] || "morning";
            },
            getTodayKey() {
                let t = new Date;
                return t.setHours(t.getHours() - 3), `wird_data_${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
            },
            getSavedState() {
                let {Prefs: t} = s(), r = this.getTodayKey(), e = {
                    completedIds: [],
                    categoriesDone: {},
                    cardCounts: {}
                }, a = t.get(r), n = null;
                try {
                    n = a ? JSON.parse(a) : null;
                } catch {
                    n = null;
                }
                return {
                    ...e,
                    ...n || {}
                };
            },
            async saveState(t) {
                let {Prefs: r} = s();
                await r.set(this.getTodayKey(), JSON.stringify(t));
            },
            async saveCardCount(t, r) {
                let e = this.getSavedState(), a = this.getStorageKey(t);
                e.cardCounts[a] = r, await this.saveState(e);
            },
            async saveCardCountForCategory(t, r, e) {
                let a = this.getSavedState(), n = this.getStorageKeyForCategory(t, r);
                a.cardCounts[n] = e, await this.saveState(a);
            },
            async saveCardComplete(t) {
                let r = this.getSavedState(), e = this.getStorageKey(t);
                r.completedIds.includes(e) || r.completedIds.push(e), await this.saveState(r);
            },
            async saveCardCompleteForCategory(t, r) {
                let e = this.getSavedState(), a = this.getStorageKeyForCategory(t, r);
                e.completedIds.includes(a) || e.completedIds.push(a), await this.saveState(e);
            },
            async resetCardProgress(t) {
                let {App: r, UI: e, syncNavEffects: a} = s(), n = this.getSavedState();
                if (r.currentCategory === "favorites") {
                    let i = `_${t}`;
                    n.completedIds = n.completedIds.filter(c => !c.endsWith(i)), Object.keys(n.cardCounts).forEach(c => {
                        c.endsWith(i) && delete n.cardCounts[c];
                    }), await this.saveState(n), e.updateCategoryUI(), e.render(), e.updateCategoryUI(), 
                    a(), a();
                    return;
                }
                let o = this.getStorageKey(t);
                n.completedIds = n.completedIds.filter(i => i !== o), n.cardCounts[o] && delete n.cardCounts[o], 
                n.categoriesDone[r.currentCategory] && (delete n.categoriesDone[r.currentCategory], 
                e.updateCategoryUI()), await this.saveState(n);
            },
            async resetCurrentCategory() {
                let {App: t, UI: r, syncNavEffects: e} = s(), a = t.uiStrings[t.currentLang]?.reset_confirm || "Reset this category?";
                if (!await r.confirm(a)) return;
                let o = this.getSavedState();
                if (t.currentCategory === "favorites") {
                    let c = new Set(t.favorites || []);
                    o.completedIds = o.completedIds.filter(l => {
                        for (let d of c) if (l.endsWith(`_${d}`)) return !1;
                        return !0;
                    }), Object.keys(o.cardCounts).forEach(l => {
                        for (let d of c) if (l.endsWith(`_${d}`)) {
                            delete o.cardCounts[l];
                            break;
                        }
                    }), await this.saveState(o), r.updateCategoryUI(), r.render(), e(), r.toast(t.uiStrings[t.currentLang]?.toast_reset_done || "Progress reset.", "success"), 
                    r.vibrate(40);
                    return;
                }
                t.adhkarData.filter(c => (Array.isArray(c.category) ? c.category : [ c.category ]).includes(t.currentCategory)).forEach(c => {
                    let l = this.getStorageKey(c.id);
                    o.completedIds = o.completedIds.filter(d => d !== l), o.cardCounts[l] && delete o.cardCounts[l];
                }), o.categoriesDone[t.currentCategory] && delete o.categoriesDone[t.currentCategory], 
                document.querySelector("nav")?.classList.remove("nav-reward-all-done"), await this.saveState(o), 
                r.updateCategoryUI(), r.render(), e(), r.toast(t.uiStrings[t.currentLang]?.toast_reset_done || "Progress reset.", "success"), 
                r.vibrate(40);
            },
            async saveCategoryComplete(t) {
                let {UI: r, Streak: e, Reminders: a, syncNavEffects: n} = s();
                if (t === "favorites") return;
                let o = this.getSavedState();
                o.categoriesDone[t] = !0, await this.saveState(o), r.updateCategoryUI(), n(), this.triggerNavReward(), 
                await e.awardForToday(), (t === "morning" || t === "evening") && await a.scheduleAll();
            },
            async triggerNavReward() {
                let {App: t, Prefs: r, UI: e, HapticsEngine: a} = s(), n = document.querySelector("nav"), o = this.getSavedState();
                if ([ "morning", "evening", "waking", "sleep" ].every(l => o.categoriesDone[l])) {
                    n.classList.remove("nav-reward-category"), n.classList.add("nav-reward-all-done");
                    let d = `reward_played_${this.getTodayKey()}`;
                    r.get(d) !== "true" && (await r.set(d, "true"), e.confetti(), a.celebrationSequence());
                } else n.classList.add("nav-reward-category"), setTimeout(() => n.classList.remove("nav-reward-category"), 1500);
            }
        };
    }
    var $e = D(() => {});
    function Be(s) {
        return {
            getCurrentStreak() {
                let {Prefs: t} = s();
                return parseInt(t.get("wird_streak") || "0", 10);
            },
            refreshUI() {
                let {App: t, Prefs: r, formatShortDate: e} = s(), a = document.getElementById("streakValue");
                a && (a.innerText = String(this.getCurrentStreak()));
                let n = document.getElementById("streakSub"), o = r.get("wird_last_active_date");
                if (n) if (o) {
                    let c = t.uiStrings?.[t.currentLang]?.streak_last_active || "Last active: {date}";
                    n.innerText = c.replace("{date}", e(o));
                } else n.innerText = "";
                let i = document.getElementById("habitVisualizer");
                if (i) {
                    i.innerHTML = "";
                    let c = [];
                    try {
                        c = JSON.parse(r.get("wird_active_dates") || "[]");
                    } catch {
                        c = [];
                    }
                    let l = new Date;
                    l.setHours(l.getHours() - 3);
                    let d = [ "sun", "mon", "tue", "wed", "thu", "fri", "sat" ];
                    for (let u = 6; u >= 0; u--) {
                        let g = new Date(l);
                        g.setDate(g.getDate() - u);
                        let m = g.toDateString(), y = c.includes(m), S = `day_${d[g.getDay()]}`, h = t.uiStrings[t.currentLang]?.[S] || d[g.getDay()].charAt(0).toUpperCase(), p = document.createElement("div");
                        p.className = "flex flex-col items-center gap-1 flex-1";
                        let b = y ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-transparent", E = u === 0 ? "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-800" : "";
                        p.innerHTML = `\n                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${b} ${E}">\n                            ${y ? "✓" : ""}\n                        </div>\n                        <span class="text-[9px] font-bold text-slate-400 uppercase">${h}</span>\n                    `, 
                        i.appendChild(p);
                    }
                }
            },
            async awardForToday() {
                let {Prefs: t, WidgetSync: r} = s(), e = "wird_streak", a = "wird_last_active_date", n = "wird_active_dates", o = new Date;
                o.setHours(o.getHours() - 3);
                let i = o.toDateString(), c = t.get(a), l = parseInt(t.get(e) || "0", 10), d = [];
                try {
                    d = JSON.parse(t.get(n) || "[]");
                } catch {
                    d = [];
                }
                if (d.includes(i) || (d.push(i), d.length > 30 && (d = d.slice(-30)), await t.set(n, JSON.stringify(d))), 
                c !== i) {
                    let u = new Date(o);
                    u.setDate(u.getDate() - 1), c === u.toDateString() ? l++ : l = 1, await t.set(e, String(l)), 
                    await t.set(a, i);
                }
                this.refreshUI(), await r.requestUpdate();
            }
        };
    }
    var Me = D(() => {});
    function Ue(s) {
        return {
            async persist() {
                let {App: t, Prefs: r} = s();
                await r.set("wird_favorites", JSON.stringify(t.favorites));
            },
            async toggle(t) {
                let {App: r, HapticsEngine: e, UI: a} = s();
                if (r.favorites.includes(t) ? r.favorites = r.favorites.filter(n => n !== t) : (r.favorites.push(t), 
                e.lightTap()), await this.persist(), r.currentCategory === "favorites") a.render(); else {
                    let n = document.querySelector(`.btn-heart[data-id="${t}"]`);
                    if (n) {
                        let o = r.favorites.includes(t);
                        n.innerHTML = a.getHeartIcon(o), n.classList.toggle("active", o), n.style.color = o ? "#ef4444" : "", 
                        n.setAttribute("aria-pressed", o ? "true" : "false");
                    }
                }
            }
        };
    }
    var He = D(() => {});
    function Fe(s) {
        return {
            async init() {
                if (this.toggleEl = document.getElementById("remindersToggle"), this.timesContainer = document.getElementById("remindersTimes"), 
                this.morningEl = document.getElementById("timeMorning"), this.eveningEl = document.getElementById("timeEvening"), 
                this.webWarning = document.getElementById("remindersWebWarning"), !this.toggleEl) return;
                let {App: t, Prefs: r, UI: e} = s(), a = r.get("wird_reminders_enabled") === "true", n = r.get("wird_reminder_morning_time") || "07:00", o = r.get("wird_reminder_evening_time") || "17:00";
                this.toggleEl.checked = a, this.morningEl && (this.morningEl.value = n), this.eveningEl && (this.eveningEl.value = o), 
                this.updateUI();
                let i = window.Capacitor?.Plugins?.LocalNotifications;
                if (i ? this.webWarning && this.webWarning.classList.add("hidden") : (this.toggleEl.disabled = !0, 
                this.toggleEl.parentElement.style.opacity = "0.5", this.webWarning && (this.webWarning.classList.remove("hidden"), 
                this.webWarning.innerText = t.uiStrings[t.currentLang]?.notification_app_only || "Reminders are only available in the app.")), 
                this.toggleEl.addEventListener("change", c => this.handleToggle(c.target.checked)), 
                this.morningEl && this.morningEl.addEventListener("change", c => this.handleTimeChange("morning", c.target.value)), 
                this.eveningEl && this.eveningEl.addEventListener("change", c => this.handleTimeChange("evening", c.target.value)), 
                i) try {
                    i.addListener("localNotificationActionPerformed", c => {
                        let {App: l, UI: d} = s(), u = c.notification.extra;
                        u && u.category && (l.currentCategory = u.category, setTimeout(() => {
                            d.updateCategoryUI(), d.render(!0), d.scrollToActiveCategory();
                        }, 500));
                    });
                } catch (c) {
                    console.error("LocalNotifications listener error", c);
                }
            },
            updateUI() {
                this.toggleEl.checked ? (this.timesContainer?.classList.remove("hidden"), this.timesContainer?.classList.add("flex")) : (this.timesContainer?.classList.add("hidden"), 
                this.timesContainer?.classList.remove("flex"));
            },
            async handleToggle(t) {
                let {App: r, Prefs: e, UI: a} = s(), n = window.Capacitor?.Plugins?.LocalNotifications;
                if (n) if (t) {
                    let o = await n.checkPermissions();
                    if (o.display !== "granted" && (o = await n.requestPermissions()), o.display !== "granted") {
                        this.toggleEl.checked = !1, this.updateUI(), a.toast(r.uiStrings[r.currentLang]?.notifications_denied || "Permission denied.", "error");
                        return;
                    }
                    await e.set("wird_reminders_enabled", "true"), this.updateUI(), await this.scheduleAll(), 
                    a.toast(r.uiStrings[r.currentLang]?.toast_reminders_set || "Reminders enabled.", "success");
                } else await e.set("wird_reminders_enabled", "false"), this.updateUI(), await this.cancelAll(), 
                a.toast(r.uiStrings[r.currentLang]?.toast_reminders_off || "Reminders disabled.", "info");
            },
            async handleTimeChange(t, r) {
                let {App: e, Prefs: a, UI: n} = s();
                r && (await a.set(`wird_reminder_${t}_time`, r), this.toggleEl.checked && (await this.scheduleAll(), 
                n.toast(e.uiStrings[e.currentLang]?.toast_time_updated || "Time updated.", "success")));
            },
            async scheduleAll() {
                let {App: t, Prefs: r, Storage: e} = s(), a = window.Capacitor?.Plugins?.LocalNotifications;
                if (!a) return;
                await this.cancelAll();
                let n = r.get("wird_reminder_morning_time") || "07:00", o = r.get("wird_reminder_evening_time") || "17:00", [i, c] = n.split(":").map(Number), [l, d] = o.split(":").map(Number), u = (h, p) => t.uiStrings[t.currentLang]?.[h] || p, g = new Set([ "ar" ]), m = h => g.has(t.currentLang) ? h : `‎${h}`, y = [], S = e.getSavedState();
                if (!isNaN(i) && !isNaN(c)) {
                    let h = S.categoriesDone?.morning === !0, p = {
                        on: {
                            hour: i,
                            minute: c
                        }
                    };
                    if (h) {
                        let b = new Date;
                        b.setDate(b.getDate() + 1), b.setHours(i, c, 0, 0), p.at = b, delete p.on;
                    }
                    y.push({
                        id: 1,
                        title: m(u("reminder_morning_title", "🌅 Morning Adhkar")),
                        body: m(u("reminder_morning_body", "Start your day with remembrance of Allah.")),
                        schedule: p,
                        extra: {
                            category: "morning"
                        }
                    });
                }
                if (!isNaN(l) && !isNaN(d)) {
                    let h = S.categoriesDone?.evening === !0, p = {
                        on: {
                            hour: l,
                            minute: d
                        }
                    };
                    if (h) {
                        let b = new Date;
                        b.setDate(b.getDate() + 1), b.setHours(l, d, 0, 0), p.at = b, delete p.on;
                    }
                    y.push({
                        id: 2,
                        title: m(u("reminder_evening_title", "🌙 Evening Adhkar")),
                        body: m(u("reminder_evening_body", "End your day with remembrance of Allah.")),
                        schedule: p,
                        extra: {
                            category: "evening"
                        }
                    });
                }
                if (y.length > 0) try {
                    await a.schedule({
                        notifications: y
                    });
                } catch (h) {
                    console.error("Failed to schedule notifications", h);
                }
            },
            async cancelAll() {
                let t = window.Capacitor?.Plugins?.LocalNotifications;
                if (t) try {
                    await t.cancel({
                        notifications: [ {
                            id: 1
                        }, {
                            id: 2
                        } ]
                    });
                } catch {}
            }
        };
    }
    var De = D(() => {});
    function Ne(s) {
        return {
            _audio: new Audio,
            _isPlaying: !1,
            _lastFallbackId: null,
            init() {
                this._audio.preload = "none", this.bar = document.getElementById("audioPlayerBar"), 
                this.title = document.getElementById("audioTitle"), this.progress = document.getElementById("audioProgress"), 
                this.playPauseBtn = document.getElementById("audioPlayPauseBtn"), this.stopBtn = document.getElementById("audioStopBtn"), 
                this.playIcon = document.getElementById("playIcon"), this.pauseIcon = document.getElementById("pauseIcon"), 
                this._audio.addEventListener("timeupdate", () => this.updateProgress()), this._audio.addEventListener("ended", () => this.stop()), 
                this._audio.addEventListener("error", () => this.handleError());
                let {UI: t} = s();
                this.playPauseBtn && (this.playPauseBtn.onclick = () => this.toggle()), this.stopBtn && (this.stopBtn.onclick = () => t.stopAllAudio());
            },
            getAudioUrl(t) {
                let {projectUrl: r} = s();
                if (!t?.id) return null;
                let e = typeof t.audio_url == "string" ? t.audio_url.trim() : "";
                if (e) {
                    if (/^https?:\/\//i.test(e)) return e;
                    let a = e.replace(/\.mp3$/i, "");
                    return `${r()}/audio/${encodeURIComponent(a)}.mp3`;
                }
                return `./audio/${encodeURIComponent(t.id)}.mp3`;
            },
            async play(t) {
                let {App: r, UI: e} = s();
                if (r.currentAudioId === t.id) {
                    e.stopAllAudio();
                    return;
                }
                e.stopAllAudio();
                let a = this.getAudioUrl(t);
                if (!a) {
                    this.fallback(t);
                    return;
                }
                this._audio.pause(), this._audio.src = a, this._audio.load(), r.currentAudioId = t.id, 
                this.title && (this.title.innerText = t.arabic.substring(0, 30) + "...");
                try {
                    await this._audio.play(), this._isPlaying = !0, this.showPlayer(), this.syncUI();
                } catch (n) {
                    console.warn("Audio play attempt failed, waiting for error event...", n);
                    let o = r.currentAudioId;
                    this.stop(), r.currentAudioId = null, o === t.id && this.fallback(t);
                }
            },
            toggle() {
                this._audio.src && (this._isPlaying ? (this._audio.pause(), this._isPlaying = !1) : (this._audio.play().catch(t => console.error("Resume failed", t)), 
                this._isPlaying = !0), this.syncUI());
            },
            stop() {
                this._audio.pause(), this._audio.removeAttribute("src");
                try {
                    this._audio.currentTime = 0;
                } catch {}
                this._isPlaying = !1, this.hidePlayer(), this.syncUI();
            },
            updateProgress() {
                if (!this._audio.duration || !isFinite(this._audio.duration)) return;
                let t = this._audio.currentTime / this._audio.duration * 100;
                this.progress && (this.progress.style.width = `${t}%`);
            },
            syncUI() {
                let {App: t, CFG: r} = s();
                this._isPlaying ? (this.playIcon?.classList.add("hidden"), this.pauseIcon?.classList.remove("hidden")) : (this.playIcon?.classList.remove("hidden"), 
                this.pauseIcon?.classList.add("hidden"));
                let e = this._isPlaying ? r("aria_pause", "Pause") : r("aria_play", "Play");
                this.playPauseBtn && this.playPauseBtn.setAttribute("aria-label", e), document.querySelectorAll(".btn-speak").forEach(a => {
                    let n = a.getAttribute("data-id"), o = !!window.speechSynthesis?.speaking, i = n === t.currentAudioId && (this._isPlaying || o);
                    a.classList.toggle("active", i);
                });
            },
            showPlayer() {
                this.bar?.classList.remove("translate-y-full"), this.bar?.classList.add("flex");
                let t = document.getElementById("adhkar-container");
                t && (t.style.paddingBottom = "100px");
            },
            hidePlayer() {
                this.bar?.classList.add("translate-y-full");
                let t = document.getElementById("adhkar-container");
                t && (t.style.paddingBottom = "0px");
            },
            handleError() {
                let {App: t} = s();
                if (this._audio.getAttribute("src")) {
                    if (t.currentAudioId) {
                        let r = t.adhkarData.find(e => e.id === t.currentAudioId);
                        r && this.fallback(r);
                    }
                    this.stop();
                }
            },
            fallback(t) {
                let {App: r, UI: e} = s();
                this._lastFallbackId !== t.id && (window.speechSynthesis?.speaking && r.currentAudioId === t.id || (this._lastFallbackId = t.id, 
                setTimeout(() => this._lastFallbackId = null, 3e3), e.toast(r.uiStrings[r.currentLang]?.tts_fallback || "Audio unavailable: using robotic voice", "info"), 
                e.toggleSpeech(t.arabic, t.id, {
                    forceStart: !0
                })));
            }
        };
    }
    var qe = D(() => {});
    function Re(s) {
        let t = e => document.getElementById(e), r = (e, a = document) => Array.from(a.querySelectorAll(e));
        return {
            scrollToActiveCategory() {
                let e = t("category-nav-container"), a = e?.querySelector(".bg-emerald-100, .dark\\:bg-emerald-900");
                if (a && e) {
                    let n = a.offsetLeft - e.clientWidth / 2 + a.clientWidth / 2;
                    e.scrollTo({
                        left: n,
                        behavior: "smooth"
                    });
                }
            },
            vibrate(e) {
                let {App: a, HapticsEngine: n} = s();
                if (a.isHapticEnabled) {
                    if (Array.isArray(e)) {
                        navigator.vibrate && navigator.vibrate(e);
                        return;
                    }
                    typeof e == "number" && n.pulseMs(e);
                }
            },
            announceMilestone(e, a) {
                let {App: n} = s(), o = t("a11y-announcer");
                if (o) {
                    if (e >= a) {
                        let i = n.uiStrings?.[n.currentLang]?.completed || "Completed";
                        o.innerText = `${e}. ${i}.`;
                        return;
                    }
                    e % 10 === 0 && (o.innerText = String(e));
                }
            },
            smartHapticForCounter(e, a) {
                let {App: n, HapticsEngine: o} = s();
                if (n.isHapticEnabled) {
                    if (e >= a) {
                        o.completionPulse();
                        return;
                    }
                    if (e % 10 === 0) {
                        o.milestoneThump();
                        return;
                    }
                    o.lightTap();
                }
            },
            confetti() {
                let e = document.body, a = [ "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6" ], n = 40;
                for (let o = 0; o < n; o++) {
                    let i = document.createElement("div");
                    i.className = "confetti-particle", i.style.backgroundColor = a[Math.floor(Math.random() * a.length)], 
                    i.style.left = Math.random() * 100 + "vw", i.style.top = "-10px", i.style.transform = `scale(${Math.random()})`, 
                    i.style.setProperty("--x", (Math.random() - .5) * 200 + "px"), i.style.setProperty("--r", Math.random() * 360 + "deg");
                    let c = 2 + Math.random() * 2;
                    i.style.animation = `confetti-fall ${c}s ease-out forwards`, e.appendChild(i), setTimeout(() => i.remove(), c * 1e3);
                }
            },
            initFontSize() {
                let {Prefs: e} = s(), a = t("fontSizeSlider"), n = t("fontSizeLabel"), o = e.get("fontScale") || "1";
                document.documentElement.style.setProperty("--arabic-scale", o), a && (a.value = o, 
                n && (n.innerText = Math.round(parseFloat(o) * 100) + "%"), a.oninput = async i => {
                    let c = i.target.value;
                    document.documentElement.style.setProperty("--arabic-scale", c), n && (n.innerText = Math.round(parseFloat(c) * 100) + "%"), 
                    await e.set("fontScale", c);
                });
            },
            initVoiceSpeed() {
                let {Prefs: e} = s(), a = t("voiceSpeedSlider"), n = t("voiceSpeedLabel"), o = e.get("wird_tts_speed") || "0.85";
                a && (a.value = o, n && (n.innerText = o + "x"), a.oninput = async i => {
                    let c = i.target.value;
                    n && (n.innerText = c + "x"), await e.set("wird_tts_speed", c);
                });
            },
            async checkCategoryCompletion(e) {
                let {Storage: a} = s(), n = a.getSavedState(), {filtered: o} = this.getFilteredData();
                if (o.length === 0) return;
                o.filter(c => {
                    let l = a.getStorageKeyForCategory(e, c.id);
                    return n.completedIds.includes(l);
                }).length >= o.length && await a.saveCategoryComplete(e);
            },
            updateStickyTitle() {
                let {App: e} = s(), a = t("stickyCategoryTitle");
                if (!a) return;
                let n = e.uiStrings[e.currentLang] && e.uiStrings[e.currentLang][e.currentCategory] ? e.uiStrings[e.currentLang][e.currentCategory] : e.currentCategory;
                e.currentCategory === "morning" && !e.uiStrings[e.currentLang]?.[e.currentCategory] && (n = e.uiStrings[e.currentLang]?.morning || "Morning"), 
                e.currentCategory === "favorites" && !e.uiStrings[e.currentLang]?.[e.currentCategory] && (n = "Favorites"), 
                a.innerText = n;
            },
            updateCategoryUI() {
                let {App: e, Storage: a, MAIN_CATEGORIES: n, isCategoryCompleteDynamic: o} = s(), i = [ "favorites", ...n ], c = a.getSavedState(), l = [ "bg-emerald-100", "text-emerald-700", "shadow-sm", "dark:bg-emerald-900", "dark:text-emerald-300", "border-emerald-200", "dark:border-emerald-700", "border" ], d = [ "bg-slate-200", "text-slate-500", "hover:bg-slate-300", "dark:bg-slate-700", "dark:text-slate-400", "dark:hover:bg-slate-600" ], u = [ "ring-2", "ring-emerald-500", "ring-offset-1", "dark:ring-offset-slate-900" ];
                i.forEach(g => {
                    let m = t(`btn-${g}`);
                    if (!m) return;
                    m.className = "flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 border border-transparent whitespace-nowrap snap-start";
                    let y = e.uiStrings[e.currentLang]?.[g] || g;
                    g === "favorites" && !e.uiStrings[e.currentLang]?.[g] && (y = "Favorites"), g === "morning" && !e.uiStrings[e.currentLang]?.[g] && (y = "Morning"), 
                    o(c, g) && g !== "favorites" ? (m.innerHTML = `<span class="inline-block text-emerald-500">✓</span> ${y}`, 
                    m.classList.add(...u)) : g === "favorites" ? m.innerHTML = `❤️ ${y}` : m.innerHTML = y, 
                    e.currentCategory === g ? m.classList.add(...l) : m.classList.add(...d);
                });
            },
            ensureToastContainer() {
                let e = document.getElementById("toast-container");
                return e || (e = document.createElement("div"), e.id = "toast-container", e.setAttribute("aria-live", "polite"), 
                e.setAttribute("aria-atomic", "true"), document.body.appendChild(e)), e;
            },
            toast(e, a = "info", n = 2200) {
                let {App: o} = s();
                if (!e) return;
                let i = this.ensureToastContainer(), c = document.createElement("div");
                c.className = `toast ${a}`, c.dir = o.currentLang === "ar" ? "rtl" : "ltr", c.textContent = e, 
                i.appendChild(c), requestAnimationFrame(() => c.classList.add("show")), window.setTimeout(() => {
                    c.classList.remove("show"), window.setTimeout(() => c.remove(), 200);
                }, n);
            },
            toastAction(e, a, n, o = "info", i = 8e3) {
                let {App: c} = s();
                if (!e) return;
                let l = this.ensureToastContainer(), d = document.createElement("div");
                d.className = `toast ${o}`, d.dir = c.currentLang === "ar" ? "rtl" : "ltr";
                let u = document.createElement("div");
                u.className = "toast-row";
                let g = document.createElement("div");
                g.textContent = e;
                let m = document.createElement("button");
                m.className = "toast-action", m.type = "button", m.textContent = a || c.uiStrings?.[c.currentLang]?.btn_ok || "OK", 
                m.onclick = () => {
                    try {
                        n && n();
                    } catch {}
                    d.classList.remove("show"), setTimeout(() => d.remove(), 200);
                }, u.appendChild(g), u.appendChild(m), d.appendChild(u), l.appendChild(d), requestAnimationFrame(() => d.classList.add("show")), 
                window.setTimeout(() => {
                    d.isConnected && (d.classList.remove("show"), window.setTimeout(() => d.remove(), 200));
                }, i);
            },
            confirm(e, a = {}) {
                let {App: n} = s();
                return new Promise(o => {
                    let i = a.okText || n.uiStrings?.[n.currentLang]?.btn_ok || "OK", c = a.cancelText || n.uiStrings?.[n.currentLang]?.btn_cancel || "Cancel", l = document.createElement("div");
                    l.className = "dialog-overlay", l.dir = n.currentLang === "ar" ? "rtl" : "ltr";
                    let d = document.createElement("div");
                    d.className = "dialog", d.setAttribute("role", "dialog"), d.setAttribute("aria-modal", "true");
                    let u = document.createElement("div");
                    u.className = "dialog-body", u.textContent = e || "";
                    let g = document.createElement("div");
                    g.className = "dialog-actions";
                    let m = document.createElement("button");
                    m.className = "dialog-btn cancel", m.type = "button", m.textContent = c;
                    let y = document.createElement("button");
                    y.className = "dialog-btn ok", y.type = "button", y.textContent = i;
                    let S = p => {
                        l.remove(), document.removeEventListener("keydown", h, !0), o(p);
                    }, h = p => {
                        if (p.key === "Escape" && (p.preventDefault(), S(!1)), p.key === "Tab") {
                            let b = document.activeElement;
                            p.shiftKey && b === m ? (p.preventDefault(), y.focus()) : !p.shiftKey && b === y && (p.preventDefault(), 
                            m.focus());
                        }
                        p.key === "Enter" && (document.activeElement === y || document.activeElement === m) && (p.preventDefault(), 
                        S(document.activeElement === y));
                    };
                    m.onclick = () => S(!1), y.onclick = () => S(!0), l.onclick = p => {
                        p.target === l && S(!1);
                    }, g.appendChild(m), g.appendChild(y), d.appendChild(u), d.appendChild(g), l.appendChild(d), 
                    document.body.appendChild(l), document.addEventListener("keydown", h, !0), setTimeout(() => y.focus(), 0);
                });
            },
            info(e, a = {}) {
                let {App: n} = s();
                return new Promise(o => {
                    let i = a.okText || n.uiStrings?.[n.currentLang]?.btn_ok || "OK", c = document.createElement("div");
                    c.className = "dialog-overlay", c.dir = n.currentLang === "ar" ? "rtl" : "ltr";
                    let l = document.createElement("div");
                    l.className = "dialog", l.setAttribute("role", "dialog"), l.setAttribute("aria-modal", "true");
                    let d = document.createElement("div");
                    d.className = "dialog-body", a.isHtml ? d.innerHTML = e || "" : d.textContent = e || "";
                    let u = document.createElement("div");
                    u.className = "dialog-actions";
                    let g = document.createElement("button");
                    g.className = "dialog-btn ok", g.type = "button", g.textContent = i;
                    let m = () => {
                        c.remove(), document.removeEventListener("keydown", y, !0), o();
                    }, y = S => {
                        (S.key === "Escape" || S.key === "Enter") && (S.preventDefault(), m());
                    };
                    g.onclick = m, c.onclick = S => {
                        S.target === c && m();
                    }, u.appendChild(g), l.appendChild(d), l.appendChild(u), c.appendChild(l), document.body.appendChild(c), 
                    document.addEventListener("keydown", y, !0), setTimeout(() => g.focus(), 0);
                });
            },
            async copyToClipboard(e) {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) return await navigator.clipboard.writeText(e), 
                    !0;
                } catch {}
                try {
                    let a = document.createElement("textarea");
                    a.value = e, a.setAttribute("readonly", ""), a.style.position = "fixed", a.style.opacity = "0", 
                    a.style.left = "-9999px", document.body.appendChild(a), a.select();
                    let n = document.execCommand("copy");
                    return document.body.removeChild(a), !!n;
                } catch {
                    return !1;
                }
            },
            applyUITranslations() {
                let {App: e} = s();
                if (!e.uiStrings[e.currentLang]) return;
                let a = e.currentLang === "ar";
                document.documentElement.dir = a ? "rtl" : "ltr", document.documentElement.lang = e.currentLang, 
                r("[data-i18n]").forEach(n => {
                    let o = n.getAttribute("data-i18n");
                    o && e.uiStrings[e.currentLang][o] && (n.innerText = e.uiStrings[e.currentLang][o]);
                }), r("[data-i18n-aria]").forEach(n => {
                    let o = n.getAttribute("data-i18n-aria"), i = o && e.uiStrings[e.currentLang]?.[o];
                    i && n.setAttribute("aria-label", i);
                }), r("[data-i18n-title]").forEach(n => {
                    let o = n.getAttribute("data-i18n-title"), i = o && e.uiStrings[e.currentLang]?.[o];
                    i && n.setAttribute("title", i);
                }), r("[data-i18n-placeholder]").forEach(n => {
                    let o = n.getAttribute("data-i18n-placeholder"), i = o && e.uiStrings[e.currentLang]?.[o];
                    i && n.setAttribute("placeholder", i);
                }), this.updateMetaTags();
            },
            updateMetaTags() {
                let {App: e, projectUrl: a} = s(), n = e.uiStrings[e.currentLang];
                if (!n) return;
                let o = n.seo_title || document.title || "Wird", i = n[e.currentCategory] || e.currentCategory;
                document.title = `${o} - ${i}`;
                let c = n.seo_description || "Islamic Adhkar App", l = document.querySelector('meta[name="description"]'), d = document.querySelector('meta[property="og:description"]'), u = document.querySelector('meta[name="twitter:description"]');
                l && l.setAttribute("content", c), d && d.setAttribute("content", c), u && u.setAttribute("content", c);
                let g = document.querySelector('meta[property="og:title"]'), m = document.querySelector('meta[name="twitter:title"]');
                g && g.setAttribute("content", o), m && m.setAttribute("content", o);
                let y = document.querySelector('meta[name="keywords"]');
                y && n.seo_keywords && y.setAttribute("content", n.seo_keywords);
                let S = e.currentLang || "en", h = S === "en" ? `${a()}/` : `${a()}/?lang=${encodeURIComponent(S)}`, p = document.querySelector('link[rel="canonical"]');
                p && p.setAttribute("href", h);
                let b = document.querySelector('meta[property="og:url"]');
                b && b.setAttribute("content", h);
                let E = n.seo_image_alt || "Wird app preview", F = document.querySelector('meta[name="twitter:image:alt"]');
                F && F.setAttribute("content", E);
                let _ = document.querySelector('meta[property="og:image:alt"]');
                _ && _.setAttribute("content", E);
            },
            stopAllAudio() {
                let {App: e, AudioController: a} = s();
                a.stop(), window.speechSynthesis && window.speechSynthesis.cancel(), e.currentAudioId = null, 
                e.currentUtterance = null, a.syncUI();
            },
            toggleSpeech(e, a = null, n = {}) {
                let {App: o, Prefs: i, AudioController: c} = s(), l = window.speechSynthesis, d = !!n.forceStart, u = o.uiStrings[o.currentLang]?.tts_unavailable || "Text-to-speech unavailable on this device.";
                if (!l || typeof SpeechSynthesisUtterance > "u") {
                    this.toast(u, "error");
                    return;
                }
                if (l.speaking && o.currentAudioId === a) {
                    if (d) return;
                    this.stopAllAudio();
                    return;
                }
                this.stopAllAudio();
                let g = new SpeechSynthesisUtterance(e), m = typeof l.getVoices == "function" ? l.getVoices() : [], y = m.find(h => /^ar([-_]|$)/i.test(h.lang || "")) || m.find(h => (h.lang || "").toLowerCase().includes("ar"));
                y && (g.voice = y), g.lang = y?.lang || "ar";
                let S = parseFloat(i.get("wird_tts_speed") || "0.85");
                g.rate = S, g.onstart = () => {
                    o.currentAudioId = a, o.currentUtterance = e, c.syncUI();
                }, g.onend = () => {
                    o.currentAudioId === a && (o.currentAudioId = null, o.currentUtterance = null), 
                    c.syncUI();
                }, g.onerror = () => {
                    this.stopAllAudio(), this.toast(u, "error");
                };
                try {
                    l.speak(g);
                } catch (h) {
                    console.warn("TTS speak() failed", h), this.stopAllAudio(), this.toast(u, "error");
                }
            },
            buildShareUrl(e) {
                let {projectUrl: a} = s();
                return `${a()}/?adhkar=${encodeURIComponent(e.id)}`;
            },
            buildVerifyUrl(e) {
                let {projectUrl: a} = s();
                return `${a()}/?verify=${encodeURIComponent(e.id)}`;
            },
            buildShareText(e) {
                let {App: a} = s(), n = [];
                e.arabic && n.push(e.arabic), e.transliteration && n.push(e.transliteration);
                let o = e.translation?.[a.currentLang] || e.translation?.en || "";
                return o && n.push(o), n.push(this.buildShareUrl(e)), n.join(`\n\n`);
            },
            toggleShareMenu(e, a) {
                let {App: n, projectUrl: o} = s(), i = e.querySelector(".share-menu");
                if (i) {
                    i.remove(), e.setAttribute("aria-expanded", "false");
                    return;
                }
                r(".share-menu").forEach(p => p.remove()), r(".btn-share[aria-expanded='true']").forEach(p => p.setAttribute("aria-expanded", "false"));
                let c = a.url || o(), l = a.text || "", d = (p, b) => n.uiStrings?.[n.currentLang]?.[p] ?? n.uiStrings?.en?.[p] ?? b, u = document.createElement("div");
                u.className = "share-menu", u.setAttribute("role", "menu"), u.setAttribute("aria-label", d("aria_share_menu", "Share options")), 
                u.dir = n.currentLang === "ar" ? "rtl" : "ltr";
                let g = (p, b) => {
                    let E = document.createElement("a");
                    return E.href = p, E.target = "_blank", E.rel = "noopener", E.className = "share-item", 
                    E.setAttribute("role", "menuitem"), E.textContent = b, E.onclick = () => y(), E;
                }, m = (p, b) => {
                    let E = document.createElement("button");
                    return E.type = "button", E.className = "share-item", E.setAttribute("role", "menuitem"), 
                    E.textContent = p, E.onclick = async F => {
                        F.preventDefault(), F.stopPropagation(), await b(), y();
                    }, E;
                }, y = () => {
                    u.remove(), e.setAttribute("aria-expanded", "false");
                    try {
                        e.focus?.();
                    } catch {}
                    document.removeEventListener("click", S, !0), document.removeEventListener("keydown", h, !0);
                }, S = p => {
                    !u.contains(p.target) && !e.contains(p.target) && y();
                }, h = p => {
                    if (p.key === "Escape") {
                        p.preventDefault(), y();
                        return;
                    }
                    let b = r(".share-item", u), E = b.indexOf(document.activeElement);
                    p.key === "ArrowDown" ? (p.preventDefault(), (b[(E + 1) % b.length] || b[0])?.focus?.()) : p.key === "ArrowUp" ? (p.preventDefault(), 
                    (b[(E - 1 + b.length) % b.length] || b[b.length - 1])?.focus?.()) : p.key === "Home" ? (p.preventDefault(), 
                    b[0]?.focus?.()) : p.key === "End" && (p.preventDefault(), b[b.length - 1]?.focus?.());
                };
                u.appendChild(g(`https://wa.me/?text=${encodeURIComponent(l)}`, d("share_whatsapp", "WhatsApp"))), 
                u.appendChild(g(`https://t.me/share/url?url=${encodeURIComponent(c)}&text=${encodeURIComponent(l)}`, d("share_telegram", "Telegram"))), 
                u.appendChild(m(d("share_copy_link", "Copy link"), async () => {
                    try {
                        await navigator.clipboard.writeText(c), this.toast(d("toast_link_copied", "Link copied"), "success"), 
                        this.vibrate(20);
                    } catch {
                        this.toast(d("copy_error", "Copy failed."), "error");
                    }
                })), e.appendChild(u), e.setAttribute("aria-expanded", "true"), setTimeout(() => {
                    document.addEventListener("click", S, !0), document.addEventListener("keydown", h, !0);
                    let p = u.querySelector(".share-item");
                    p && p.focus?.();
                }, 0);
            },
            getHeartIcon(e) {
                return e ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
            },
            getFilteredData() {
                let {App: e, normalizeText: a} = s(), n = e.currentLang === "ar", o = [];
                e.currentCategory === "favorites" ? o = e.adhkarData.filter(c => e.favorites.includes(c.id)) : o = e.adhkarData.filter(c => (Array.isArray(c.category) ? c.category : [ c.category ]).includes(e.currentCategory) ? !(e.isKidsMode && !c.is_kids) : !1);
                let i = o;
                if (e.searchQuery) {
                    let c = a(e.searchQuery);
                    i = o.filter(l => {
                        let d = a(l.arabic), u = a(l.transliteration), g = a(l.translation?.[e.currentLang] || l.translation?.en), m = a(l.reference);
                        return d.includes(c) || u.includes(c) || g.includes(c) || m.includes(c);
                    });
                }
                return {
                    filtered: o,
                    displayed: i,
                    isAr: n
                };
            },
            renderEmptyState(e, a) {
                let {App: n, escapeHTML: o} = s();
                if (a === "search") {
                    let c = (n.uiStrings[n.currentLang]?.search_no_results || 'No results found for "{query}"').replace("{query}", o(n.searchQuery)), l = n.uiStrings[n.currentLang]?.clear_search || "Clear search";
                    e.innerHTML = `\n                    <div class="flex flex-col items-center justify-center py-20 text-slate-400 px-6">\n                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\n                      <p class="text-center text-sm mb-6">${c}</p>\n                      <button id="emptyClearSearchBtn" class="px-5 py-2 rounded-xl font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 active:scale-95 transition-all">${l}</button>\n                    </div>`, 
                    setTimeout(() => {
                        let d = t("emptyClearSearchBtn");
                        d && (d.onclick = () => {
                            let u = t("searchInput");
                            u && (u.value = "", u.dispatchEvent(new Event("input")));
                        });
                    }, 0);
                } else if (a === "favorites") {
                    let i = n.uiStrings[n.currentLang]?.no_favorites || "No favorites yet.", c = n.uiStrings[n.currentLang]?.cta_browse_adhkar || "Browse Adhkar";
                    e.innerHTML = `\n                  <div class="flex flex-col items-center justify-center py-20 text-slate-400">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>\n                    <p class="text-center text-sm mb-4">${i}</p>\n                    <button class="browse-adhkar-btn px-5 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all">${c}</button>\n                  </div>`;
                    let l = e.querySelector(".browse-adhkar-btn");
                    l && (l.onclick = d => {
                        d.stopPropagation(), n.currentCategory = "morning", this.updateCategoryUI(), this.render(!0), 
                        setTimeout(() => this.scrollToActiveCategory(), 250);
                    });
                } else {
                    let i = n.uiStrings[n.currentLang]?.no_adkhar_found || "No Adhkar found";
                    e.innerHTML = `<div class="text-center text-slate-400 py-10">${i}</div>`;
                }
            },
            buildCard(e, a, n, o) {
                let {App: i, Storage: c, Favorites: l, Focus: d, AudioController: u, highlightText: g, isNativeCapacitor: m, openExternal: y, syncNavEffects: S} = s(), h = document.createElement("div"), p = c.getProgressCategoryForItem(e), b = c.getStorageKeyForCategory(p, e.id), E = a.completedIds.includes(b), F = i.favorites.includes(e.id);
                h.className = `adhkar-card rounded-3xl p-6 shadow-sm mb-6 bg-white dark:bg-slate-800 border dark:border-slate-700 relative ${E ? "card-done" : ""}`;
                let _ = e.benefit && e.benefit[i.currentLang] ? e.benefit[i.currentLang] : "", W = _ && _.trim().length > 0, J = e.pre_text ? `<p class="text-right text-emerald-600/70 font-serif text-lg mb-2" dir="rtl">${e.pre_text}</p>` : "", U = e.repeat > 10 ? `\n                <button class="btn-focus text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Focus mode"\n                  data-i18n-title="title_focus_mode"\n                  aria-label="Focus mode"\n                  data-i18n-aria="aria_focus_mode" data-id="${e.id}">\n                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>\n                </button>\n            ` : "", v = `\n                <button class="btn-heart text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors ${F ? "active" : ""}" title="Toggle favorite"\n                  aria-pressed="${F ? "true" : "false"}"\n                  data-i18n-title="title_toggle_favorite"\n                  aria-label="Toggle favorite"\n                  data-i18n-aria="aria_toggle_favorite" data-id="${e.id}">\n                  ${this.getHeartIcon(F)}\n                </button>\n            `, k = W ? `\n                <button class="btn-benefit text-xs flex items-center gap-1 text-amber-400 hover:text-amber-500 transition-colors" title="View reward"\n                  data-i18n-title="title_view_reward"\n                  aria-label="View reward"\n                  data-i18n-aria="aria_view_reward">\n                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>\n                </button>\n            ` : "", M = W ? `\n                <div class="benefit-box hidden" dir="${n ? "rtl" : "ltr"}">\n                    <div class="flex items-start gap-2">\n                        <span class="text-xl">✨</span>\n                        <p class="font-serif italic">${_}</p>\n                    </div>\n                </div>\n            ` : "", T = `\n                <div class="flex gap-4 mt-4 card-actions" dir="ltr">\n                  ${v}\n                  ${k}\n                  ${U}\n                  <button class="btn-speak text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Read aloud"\n                    data-i18n-aria="aria_speak"\n                    title="Read aloud"\n                    data-i18n-title="title_speak"\n                    data-id="${e.id}">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>\n                  </button>\n                  <button class="btn-share text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Share"\n                    data-i18n-aria="aria_share"\n                    title="Share"\n                    data-i18n-title="title_share"\n                    aria-haspopup="menu"\n                    aria-expanded="false">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>\n                  </button>\n                  <button class="btn-copy text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Copy"\n                    data-i18n-aria="aria_copy"\n                    title="Copy"\n                    data-i18n-title="title_copy">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>\n                    <span class="copy-text hidden sm:inline">${i.uiStrings[i.currentLang].copy || "Copy"}</span>\n                  </button>\n                </div>\n            `, P = g(e.transliteration, i.searchQuery), H = g(e.translation?.[i.currentLang] || e.translation?.en || "", i.searchQuery), N = n ? "" : `\n                <div class="details-content ${i.showDetails ? "open" : ""}">\n                  <p class="text-emerald-600 dark:text-emerald-400 text-sm italic mb-3">${P}</p>\n                  <p class="text-slate-600 dark:text-slate-300 text-sm mb-5" dir="${n ? "rtl" : "ltr"}">${H}</p>\n                </div>\n            `, x = n ? "" : `\n                <button class="toggle-btn text-xs text-slate-400 underline p-2 -m-2 z-10 hover:text-emerald-600">\n                  ${i.showDetails ? i.uiStrings[i.currentLang].hide_details : i.uiStrings[i.currentLang].show_details}\n                </button>\n            `, $ = a.cardCounts[b] || 0;
                E && ($ = e.repeat);
                let I = this.buildVerifyUrl(e);
                h.innerHTML = `\n                ${J}\n                <p class="arabic-text" dir="rtl">${e.arabic}</p>\n                <div class="mb-2 flex ${n ? "justify-end" : "justify-start"}">\n                  <a href="${I}" target="_blank" rel="noopener" class="verify-link text-[10px] uppercase tracking-widest text-emerald-600 font-bold hover:underline z-10 p-2 -m-2 block">${e.reference} 🔗</a>\n                </div>\n                ${N}\n                ${M} ${T}\n                <div class="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700" dir="ltr">\n                  ${x}\n                  ${n ? "<div></div>" : ""}\n                  <div class="flex items-center gap-4 card-actions z-10">\n                    <button class="reset-btn text-slate-300 hover:text-red-500 transition-colors p-2 -m-2" aria-label="Reset this item"\n                        data-i18n-aria="aria_reset_card"\n                        title="Reset this item"\n                        data-i18n-title="title_reset_card">\n                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>\n                    </button>\n                    <div class="counter-display bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-400 px-5 py-2 rounded-xl font-black text-2xl min-w-[80px] text-center transition-colors">\n                      <span class="counter">${$}</span>\n                      <span class="text-sm font-normal text-emerald-600 dark:text-emerald-500">/${e.repeat}</span>\n                    </div>\n                  </div>\n                  <div class="card-progress-container">\n                    <div class="card-progress-bar" style="width: ${$ / e.repeat * 100}%"></div>\n                  </div>\n                </div>\n            `;
                let K = h.querySelector(".verify-link");
                K && e.verify_url && m() && K.addEventListener("click", B => {
                    B.preventDefault(), B.stopPropagation(), y(e.verify_url);
                }), h.onclick = async B => {
                    if (B.target.closest("button") || B.target.closest("a") || window.getSelection().toString().length > 0) return;
                    let w = h.querySelector(".counter"), C = parseInt(w.innerText, 10);
                    if (C < e.repeat) {
                        h.classList.add("card-pressed"), setTimeout(() => h.classList.remove("card-pressed"), 100), 
                        C++, w.innerText = String(C);
                        let R = h.querySelector(".card-progress-bar");
                        if (R && (R.style.width = `${C / e.repeat * 100}%`), this.smartHapticForCounter(C, e.repeat), 
                        this.announceMilestone(C, e.repeat), await c.saveCardCountForCategory(p, e.id, C), 
                        C === e.repeat) {
                            h.classList.add("card-done");
                            let G = h.querySelector(".card-progress-bar");
                            G && G.classList.add("bar-completion-pulse"), await c.saveCardCompleteForCategory(p, e.id), 
                            await this.checkCategoryCompletion(i.currentCategory);
                        }
                    }
                };
                let O = h.querySelector(".reset-btn");
                O.onclick = async B => {
                    B.stopPropagation(), await c.resetCardProgress(e.id), h.querySelector(".counter").innerText = "0", 
                    h.classList.remove("card-done");
                    let w = h.querySelector(".card-progress-bar");
                    w && (w.style.width = "0%", w.classList.remove("bar-completion-pulse")), await this.checkCategoryCompletion(i.currentCategory), 
                    S();
                };
                let q = h.querySelector(".btn-speak");
                q && (q.onclick = B => {
                    B.stopPropagation(), u.play(e);
                });
                let z = h.querySelector(".btn-copy");
                z && (z.onclick = async B => {
                    B.stopPropagation();
                    let w = e.arabic;
                    if (i.currentLang !== "ar") {
                        w += `\n                        ${e.transliteration}`;
                        let R = e.translation?.[i.currentLang] || e.translation?.en || "";
                        R && (w += `\n                        ${R}`);
                    }
                    await this.copyToClipboard(w) ? (this.vibrate(20), this.toast(i.uiStrings[i.currentLang]?.toast_copied || "Copied", "success")) : this.toast(i.uiStrings[i.currentLang]?.copy_error || "Copy failed.", "error");
                });
                let V = h.querySelector(".btn-share");
                V && (V.onclick = async B => {
                    B.stopPropagation();
                    let w = this.buildShareText(e), C = this.buildShareUrl(e);
                    if (navigator.share) try {
                        await navigator.share({
                            title: i.uiStrings?.[i.currentLang]?.seo_title || "Wird",
                            text: w,
                            url: C
                        });
                        return;
                    } catch {}
                    this.toggleShareMenu(V, {
                        text: w,
                        url: C
                    });
                });
                let j = h.querySelector(".btn-heart");
                j && (j.onclick = async B => {
                    B.stopPropagation(), await l.toggle(e.id);
                });
                let Q = h.querySelector(".btn-benefit");
                Q && (Q.onclick = B => {
                    B.stopPropagation();
                    let w = h.querySelector(".benefit-box");
                    w && (w.classList.toggle("hidden"), Q.classList.toggle("text-amber-600"));
                });
                let ee = h.querySelector(".btn-focus");
                if (ee && (ee.onclick = B => {
                    B.stopPropagation();
                    let w = parseInt(h.querySelector(".counter").innerText, 10);
                    w < e.repeat && d.open(e, w);
                }), !n) {
                    let B = h.querySelector(".toggle-btn");
                    B && (B.onclick = w => {
                        w.stopPropagation(), h.querySelector(".details-content")?.classList.toggle("open"), 
                        w.target.innerText = w.target.innerText === i.uiStrings[i.currentLang].show_details ? i.uiStrings[i.currentLang].hide_details : i.uiStrings[i.currentLang].show_details;
                    });
                }
                return h;
            },
            showSkeletons() {
                let e = t("card-wrapper");
                e && (e.innerHTML = `\n                <div class="skeleton-card"></div>\n                <div class="skeleton-card"></div>\n                <div class="skeleton-card"></div>\n            `);
            },
            render(e = !0) {
                let {App: a, Storage: n} = s(), o = t("adhkar-container"), i = t("card-wrapper");
                if (i || (i = document.createElement("div"), i.id = "card-wrapper", o?.appendChild(i)), 
                !i) return;
                this.showSkeletons();
                let c = async () => {
                    e && window.scrollTo(0, 0), i.innerHTML = "";
                    let l = n.getSavedState();
                    this.updateStickyTitle();
                    let {filtered: d, displayed: u, isAr: g} = this.getFilteredData();
                    if (a.searchQuery && u.length === 0) {
                        this.renderEmptyState(i, "search");
                        return;
                    } else if (a.currentCategory === "favorites" && d.length === 0) {
                        this.renderEmptyState(i, "favorites");
                        return;
                    } else if (d.length === 0 && !a.searchQuery) {
                        this.renderEmptyState(i, "normal");
                        return;
                    }
                    let m = d.filter(h => l.completedIds.includes(n.getStorageKey(h.id))).length, y = d.length;
                    m >= y && y > 0 && await n.saveCategoryComplete(a.currentCategory);
                    let S = {
                        completedCount: m,
                        totalCount: y
                    };
                    u.forEach(h => {
                        let p = this.buildCard(h, l, g, S);
                        i.appendChild(p);
                    }), this.applyUITranslations(), await this.checkCategoryCompletion(a.currentCategory);
                };
                e ? (this.showSkeletons(), setTimeout(c, 150)) : c();
            }
        };
    }
    var Oe = D(() => {});
    function Ke(s) {
        return {
            _keyHandler: null,
            _lastFocus: null,
            open(t, r) {
                let {App: e, Storage: a} = s(), n = document.getElementById("focusModal"), o = document.getElementById("focusCounter"), i = document.getElementById("focusTarget"), c = document.getElementById("focusProgressBar");
                e.focusState = {
                    currentVal: r,
                    targetVal: t.repeat,
                    cardId: t.id,
                    category: a.getProgressCategoryForItem(t)
                }, o && (o.innerText = String(e.focusState.currentVal)), i && (i.innerText = `/ ${e.focusState.targetVal}`), 
                c && this.updateProgress(c), n?.classList.remove("hidden"), n?.classList.add("flex"), 
                n && (this._lastFocus = document.activeElement, n.setAttribute("aria-hidden", "false"), 
                document.body.classList.add("modal-open"), setTimeout(() => n.focus?.(), 0), this._keyHandler = async l => {
                    if (l.key === "Escape") {
                        l.preventDefault(), this.close();
                        return;
                    }
                    if ((l.key === " " || l.key === "Enter") && (l.preventDefault(), await this.handleTap(l)), 
                    l.key === "Tab") {
                        let d = document.getElementById("closeFocusBtn"), u = document.activeElement;
                        l.shiftKey ? u === n ? (l.preventDefault(), d?.focus?.()) : (l.preventDefault(), 
                        n.focus?.()) : u === d ? (l.preventDefault(), n.focus?.()) : (l.preventDefault(), 
                        d?.focus?.());
                    }
                }, document.addEventListener("keydown", this._keyHandler, !0));
            },
            updateProgress(t) {
                let {App: r} = s(), e = r.focusState.currentVal / r.focusState.targetVal * 100;
                t.style.width = `${e}%`;
            },
            createRipple(t, r) {
                let e = document.createElement("span"), a = Math.max(r.clientWidth, r.clientHeight), n = a / 2, o = r.getBoundingClientRect(), i = t.touches ? t.touches[0].clientX : typeof t.clientX == "number" ? t.clientX : o.left + o.width / 2, c = t.touches ? t.touches[0].clientY : typeof t.clientY == "number" ? t.clientY : o.top + o.height / 2;
                e.style.width = e.style.height = `${a}px`, e.style.left = `${i - n}px`, e.style.top = `${c - n}px`, 
                e.classList.add("ripple"), r.appendChild(e), setTimeout(() => e.remove(), 600);
            },
            async handleTap(t) {
                let {App: r, Storage: e, UI: a} = s();
                if (t.target.closest("#closeFocusBtn")) return;
                let n = document.getElementById("focusModal"), o = document.getElementById("focusCounter"), i = document.getElementById("focusProgressBar");
                if (r.focusState.currentVal < r.focusState.targetVal) {
                    r.focusState.currentVal++, o && (o.innerText = String(r.focusState.currentVal), 
                    o.style.transform = "scale(1.2)", setTimeout(() => o.style.transform = "scale(1)", 100)), 
                    n && this.createRipple(t, n), i && this.updateProgress(i), a.smartHapticForCounter(r.focusState.currentVal, r.focusState.targetVal), 
                    a.announceMilestone(r.focusState.currentVal, r.focusState.targetVal), await e.saveCardCountForCategory(r.focusState.category || r.currentCategory, r.focusState.cardId, r.focusState.currentVal);
                    let c = document.querySelector(`.btn-focus[data-id="${r.focusState.cardId}"]`);
                    if (c) {
                        let l = c.closest(".adhkar-card");
                        if (l) {
                            let d = l.querySelector(".counter");
                            d && (d.innerText = String(r.focusState.currentVal));
                            let u = l.querySelector(".card-progress-bar");
                            if (u) {
                                let g = r.focusState.currentVal / r.focusState.targetVal * 100;
                                u.style.width = `${g}%`;
                            }
                            if (r.focusState.currentVal === r.focusState.targetVal) {
                                l.classList.add("card-done");
                                let g = l.querySelector(".card-progress-bar");
                                if (g && g.classList.add("bar-completion-pulse"), await e.saveCardCompleteForCategory(r.focusState.category || r.currentCategory, r.focusState.cardId), 
                                r.currentCategory !== "favorites") {
                                    let m = document.querySelectorAll(".adhkar-card").length;
                                    document.querySelectorAll(".adhkar-card.card-done").length >= m && await e.saveCategoryComplete(r.currentCategory);
                                }
                                setTimeout(() => this.close(), 500);
                            }
                        }
                    }
                }
            },
            close() {
                let {App: t, UI: r} = s(), e = document.getElementById("focusModal"), a = document.querySelector(`.btn-focus[data-id="${t.focusState.cardId}"]`);
                if (a) {
                    let n = a.closest(".adhkar-card"), o = n?.querySelector(".counter");
                    n && o && (o.innerText = String(t.focusState.currentVal), t.focusState.currentVal >= t.focusState.targetVal && n.classList.add("card-done"));
                }
                e?.setAttribute("aria-hidden", "true"), document.body.classList.remove("modal-open"), 
                this._keyHandler && (document.removeEventListener("keydown", this._keyHandler, !0), 
                this._keyHandler = null), e?.classList.add("hidden"), e?.classList.remove("flex"), 
                r.updateCategoryUI(), this._lastFocus && this._lastFocus.focus && this._lastFocus.focus();
            }
        };
    }
    var We = D(() => {});
    function je(s) {
        return {
            async exportData() {
                let {App: t, Prefs: r, Storage: e, UI: a} = s(), n = {
                    key: "wird_backup",
                    date: (new Date).toISOString(),
                    state: e.getSavedState(),
                    favorites: t.favorites,
                    settings: {
                        lang: r.get("userLang"),
                        darkMode: r.get("darkMode"),
                        oledMode: r.get("oledMode"),
                        fontSize: r.get("fontScale"),
                        streak: r.get("wird_streak"),
                        lastActive: r.get("wird_last_active_date"),
                        activeDates: r.get("wird_active_dates")
                    }
                }, o = JSON.stringify(n, null, 2), i = `wird-backup-${(new Date).toISOString().slice(0, 10)}.json`, c = window.Capacitor;
                if (c && typeof c.isNativePlatform == "function" && c.isNativePlatform()) try {
                    let g = c.Plugins.Filesystem, m = c.Plugins.Share;
                    if (g && m) {
                        let y = await g.writeFile({
                            path: i,
                            data: o,
                            directory: "CACHE",
                            encoding: "utf8"
                        });
                        await m.share({
                            title: "Wird Backup",
                            text: "Here is your Wird backup file.",
                            url: y.uri,
                            dialogTitle: "Save Wird Backup"
                        });
                        return;
                    }
                } catch (g) {
                    console.error("Native export error:", g), a.toast(t.uiStrings[t.currentLang]?.copy_error || "Export failed.", "error");
                    return;
                }
                let l = new Blob([ o ], {
                    type: "application/json"
                }), d = URL.createObjectURL(l), u = document.createElement("a");
                u.href = d, u.download = i, document.body.appendChild(u), u.click(), document.body.removeChild(u), 
                setTimeout(() => URL.revokeObjectURL(d), 100);
            },
            importData(t) {
                let {App: r, Prefs: e, Storage: a, UI: n} = s(), o = t.target.files?.[0];
                if (!o) return;
                let i = new FileReader;
                i.onload = async c => {
                    try {
                        let l = JSON.parse(c.target.result);
                        if (l.key !== "wird_backup") throw new Error("Invalid file");
                        let d = r.uiStrings[r.currentLang]?.overwrite_confirm || "Overwrite current progress?";
                        if (await n.confirm(d)) {
                            await e.set(a.getTodayKey(), JSON.stringify(l.state)), Array.isArray(l.favorites) && await e.set("wird_favorites", JSON.stringify(l.favorites)), 
                            l.settings?.lang && await e.set("userLang", l.settings.lang), l.settings?.darkMode && await e.set("darkMode", l.settings.darkMode), 
                            l.settings?.oledMode && await e.set("oledMode", l.settings.oledMode), l.settings?.fontSize && await e.set("fontScale", l.settings.fontSize), 
                            l.settings?.streak && await e.set("wird_streak", l.settings.streak), l.settings?.lastActive && await e.set("wird_last_active_date", l.settings.lastActive), 
                            l.settings?.activeDates && await e.set("wird_active_dates", l.settings.activeDates);
                            let g = r.uiStrings[r.currentLang]?.backup_restored || "Data restored successfully!";
                            n.toast(g, "success"), location.reload();
                        }
                    } catch {
                        let l = r.uiStrings[r.currentLang]?.import_error || "Error importing file.";
                        n.toast(l, "error");
                    }
                }, i.readAsText(o);
            }
        };
    }
    var Ve = D(() => {});
    var f, se = D(() => {
        ye();
        f = {
            adhkarData: [],
            uiStrings: {},
            currentLang: "en",
            showDetails: !1,
            currentCategory: "morning",
            isKidsMode: !1,
            isHapticEnabled: !0,
            currentUtterance: null,
            currentAudioId: null,
            deferredPrompt: null,
            favorites: [],
            focusState: {
                currentVal: 0,
                targetVal: 0,
                cardId: null
            },
            searchQuery: "",
            checkFestivals() {
                let s = document.body;
                if (s.classList.remove("fest-ramadan", "fest-eid-fitr", "fest-eid-adha", "fest-hajj"), 
                A.get("wird_show_decorations") === "false") return;
                let t = new Date, r = t.getDate(), e = t.getMonth(), a = t.getFullYear();
                if (a < 1700) return;
                let n = e + 1, o = a;
                n < 3 && (o -= 1, n += 12);
                let i = Math.floor(o / 100), c = 2 - i + Math.floor(i / 4), d = Math.floor(365.25 * (o + 4716)) + Math.floor(30.6001 * (n + 1)) + r + c - 1524 + 1, u = Math.floor((d - 1948440) / 10631), g = (d - 1948440) % 10631, m = Math.floor(g / 354), y = g % 354, S = 1, h = y;
                for (let p = 0; p < 12; p++) {
                    let b = p % 2 === 0 ? 30 : 29;
                    if (h <= b) {
                        S = p + 1;
                        break;
                    }
                    h -= b;
                }
                S === 9 ? s.classList.add("fest-ramadan") : S === 10 && h <= 3 ? s.classList.add("fest-eid-fitr") : S === 12 && (h <= 9 ? s.classList.add("fest-hajj") : h <= 13 && s.classList.add("fest-eid-adha"));
            }
        };
    });
    function Ge(s) {
        ve = s;
    }
    function Je(s) {
        return s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0617-\u061A\u064B-\u0652]/g, "").toLowerCase() : "";
    }
    function oe(s) {
        return s ? s.replace(/[&<>'"]/g, t => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        }[t] || t)) : "";
    }
    function Qe(s, t) {
        if (!t || !s) return oe(s);
        let r = oe(s), e = oe(t).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), a = new RegExp(`(${e})`, "gi");
        return r.replace(a, '<mark class="search-highlight">$1</mark>');
    }
    function Ye(s) {
        try {
            let t = new Date(s);
            return Number.isNaN(t.getTime()) ? s : t.toLocaleDateString(f.currentLang || "en", {
                year: "numeric",
                month: "short",
                day: "numeric"
            });
        } catch {
            return s;
        }
    }
    function Xe(s, t, r) {
        let e = ve.getStorageKeyForCategory(t, r);
        return s.completedIds.includes(e);
    }
    function ht(s, t) {
        let r = Array.isArray(t.category) ? t.category : [ t.category ];
        for (let a of r) if (ie.includes(a) && Xe(s, a, t.id)) return !0;
        let e = `_${t.id}`;
        return s.completedIds.some(a => a.endsWith(e));
    }
    function we(s, t) {
        if (t === "favorites") {
            let e = (f.favorites || []).map(a => f.adhkarData.find(n => n.id === a)).filter(Boolean);
            return e.length === 0 ? !1 : e.every(a => ht(s, a));
        }
        let r = f.adhkarData.filter(e => !(!(Array.isArray(e.category) ? e.category : [ e.category ]).includes(t) || f.isKidsMode && !e.is_kids));
        return r.length === 0 ? !1 : r.every(e => Xe(s, t, e.id));
    }
    function ce() {
        let s = document.querySelector("nav");
        if (!s) return;
        let t = ve.getSavedState();
        ie.every(e => we(t, e)) ? s.classList.add("nav-reward-all-done") : s.classList.remove("nav-reward-all-done");
    }
    var ie, L, ze, ve, le = D(() => {
        se();
        ie = [ "morning", "evening", "waking", "sleep" ], L = s => document.getElementById(s), 
        ze = (s, t = document) => Array.from(t.querySelectorAll(s)), ve = null;
    });
    function Ze(s) {
        if (!("serviceWorker" in navigator) || window.Capacitor && window.Capacitor.isNativePlatform()) return;
        let t = !1, r = !1, e = () => {
            try {
                return f.uiStrings?.[f.currentLang]?.update_msg || "New version available! Update?";
            } catch {
                return "New version available! Update?";
            }
        }, a = n => {
            if (r) return;
            r = !0;
            let {UI: o} = s(), i = e(), c = f.uiStrings?.[f.currentLang]?.btn_update || "Update";
            o.toastAction(i, c, () => {
                t = !0, n.waiting ? n.waiting.postMessage({
                    type: "SKIP_WAITING"
                }) : n.installing ? n.installing.postMessage({
                    type: "SKIP_WAITING"
                }) : window.location.reload();
            }, "info", 9e3), setTimeout(() => {
                r = !1;
            }, 1e4);
        };
        navigator.serviceWorker.register("sw.js").then(n => {
            console.log("✅ Service Worker Registered!", n), n.waiting && navigator.serviceWorker.controller && a(n), 
            n.addEventListener("updatefound", () => {
                let o = n.installing;
                o && o.addEventListener("statechange", () => {
                    o.state === "installed" && navigator.serviceWorker.controller && (console.log("🔄 New version available!"), 
                    a(n));
                });
            });
        }).catch(n => console.error("❌ SW Registration Failed:", n)), navigator.serviceWorker.addEventListener("controllerchange", () => {
            t && window.location.reload();
        });
    }
    var et = D(() => {
        se();
    });
    function tt() {
        let s = L("settingsModal"), t = L("modalContent"), r = L("settingsBtn"), e = L("settingsCloseBtn"), a = null, n = !1, o = () => t ? ze('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', t).filter(l => !l.disabled && l.offsetParent !== null) : [], i = () => {
            !s || !t || (a = document.activeElement, n = !0, document.body.classList.add("modal-open"), 
            t.setAttribute("aria-hidden", "false"), s.classList.remove("hidden"), setTimeout(() => {
                s.classList.remove("opacity-0"), t.classList.remove("scale-95"), (o()[0] || t).focus?.();
            }, 10));
        }, c = () => {
            !s || !t || (n = !1, a && a.focus ? a.focus() : document.activeElement && document.activeElement.blur(), 
            t.setAttribute("aria-hidden", "true"), s.classList.add("opacity-0"), t.classList.add("scale-95"), 
            document.body.classList.remove("modal-open"), setTimeout(() => {
                s.classList.add("hidden");
            }, 300));
        };
        r && (r.onclick = i), e && (e.onclick = l => {
            l.stopPropagation(), c();
        }), s && (s.onclick = l => {
            l.target === s && c();
        }), document.addEventListener("keydown", l => {
            if (n) {
                if (l.key === "Escape") {
                    l.preventDefault(), c();
                    return;
                }
                if (l.key === "Tab") {
                    let d = o();
                    if (d.length === 0) return;
                    let u = d[0], g = d[d.length - 1];
                    l.shiftKey && document.activeElement === u ? (l.preventDefault(), g.focus()) : !l.shiftKey && document.activeElement === g && (l.preventDefault(), 
                    u.focus());
                }
            }
        }, !0);
    }
    var rt = D(() => {
        le();
    });
    function nt(s) {
        let {Storage: t, UI: r, Reminders: e, Focus: a, Backup: n, projectUrl: o} = s(), i = document.querySelector(".skip-link");
        i && (i.onclick = x => {
            x.preventDefault();
            let $ = L("adhkar-container");
            $ && ($.focus(), $.scrollIntoView());
        });
        let c = L("searchToggleBtn"), l = L("searchCloseBtn"), d = L("searchInput"), u = L("defaultNavContent"), g = L("searchNavContent"), m, y = () => {
            u && g && (u.style.pointerEvents = "none", u.classList.add("opacity-0"), g.style.pointerEvents = "auto", 
            g.classList.remove("opacity-0"), setTimeout(() => d?.focus(), 50));
        }, S = () => {
            u && g && (u.style.pointerEvents = "auto", u.classList.remove("opacity-0"), g.style.pointerEvents = "none", 
            g.classList.add("opacity-0"), f.searchQuery && (f.searchQuery = "", d && (d.value = ""), 
            r.render(!1)));
        };
        c && c.addEventListener("click", y), l && l.addEventListener("click", S), d && (d.addEventListener("input", x => {
            clearTimeout(m), m = setTimeout(() => {
                f.searchQuery = x.target.value.trim(), r.render(!1);
            }, 200);
        }), d.addEventListener("keydown", x => {
            x.key === "Escape" && S();
        }));
        let h = null;
        [ "favorites", "morning", "evening", "waking", "sleep" ].forEach(x => {
            let $ = L(`btn-${x}`);
            $ && ($.onclick = () => {
                let I = L("card-wrapper");
                if (!I || (window.speechSynthesis && window.speechSynthesis.cancel(), f.searchQuery && S(), 
                h = x, I.classList.contains("fade-out-left"))) return;
                I.classList.remove("fade-out-right"), I.classList.add("fade-out-left");
                let K = !1, O = z => {
                    K || z && z.target !== I || (K = !0, q && clearTimeout(q), I.removeEventListener("transitionend", O), 
                    f.currentCategory = h, r.updateCategoryUI(), r.render(!0), I.classList.remove("fade-out-left"), 
                    I.classList.add("fade-out-right"), I.offsetWidth, I.classList.remove("fade-out-right"));
                };
                I.addEventListener("transitionend", O);
                let q = setTimeout(O, 400);
            });
        });
        let p = L("kidsToggle");
        p && (p.checked = f.isKidsMode, document.body.classList.toggle("theme-kids", f.isKidsMode), 
        p.onchange = async x => {
            let {Prefs: $} = s();
            f.isKidsMode = x.target.checked, await $.set("isKidsMode", String(f.isKidsMode)), 
            document.body.classList.toggle("theme-kids", f.isKidsMode), r.render();
        });
        let b = L("decorationsToggle");
        if (b) {
            let {Prefs: x} = s(), $ = x.get("wird_show_decorations") !== "false";
            b.checked = $, b.onchange = async I => {
                let {Prefs: K} = s();
                await K.set("wird_show_decorations", String(I.target.checked)), f.checkFestivals();
            };
        }
        let E = L("langSelect");
        E && (E.onchange = async x => {
            let {Prefs: $} = s();
            f.currentLang = x.target.value, await $.set("userLang", f.currentLang), r.applyUITranslations(), 
            r.updateCategoryUI(), r.render(), $.get("wird_reminders_enabled") === "true" && await e.scheduleAll();
        });
        let F = L("resetFabBtn");
        F && (F.onclick = async x => {
            x.stopPropagation(), await t.resetCurrentCategory();
        });
        let _ = L("fabContainer"), W = L("navTitleContainer"), J = L("scrollTopBtn");
        J && (window.onscroll = () => {
            let x = window.scrollY || document.documentElement.scrollTop;
            x > 300 ? _?.classList.add("visible") : _?.classList.remove("visible"), W && (x > 100 ? (W.classList.remove("nav-state-app"), 
            W.classList.add("nav-state-cat")) : (W.classList.add("nav-state-app"), W.classList.remove("nav-state-cat")));
        }, J.onclick = x => {
            x.stopPropagation(), window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
        let U = L("focusModal");
        U && U.addEventListener("click", x => a.handleTap(x));
        let v = L("closeFocusBtn");
        v && (v.onclick = x => {
            x.stopPropagation(), a.close();
        });
        let k = L("exportBtn");
        k && (k.onclick = x => {
            x.stopPropagation(), n.exportData();
        });
        let M = L("importBtn"), T = L("importInput");
        M && T && (M.onclick = x => {
            x.stopPropagation(), T.click();
        }, T.onchange = x => {
            n.importData(x), T.value = "";
        });
        let P = L("shareAppBtn");
        P && (P.onclick = async x => {
            x.stopPropagation();
            let $ = f.uiStrings?.[f.currentLang]?.app_name || "Wird", I = f.uiStrings?.[f.currentLang]?.share_app_text || "Check out Wird: a free, offline, and ad-free Islamic Adhkar app.", K = f.currentLang || "en", O = K === "en" ? `${o()}/` : `${o()}/?lang=${encodeURIComponent(K)}`;
            if (navigator.share) try {
                await navigator.share({
                    title: $,
                    text: I,
                    url: O
                });
            } catch {} else await r.copyToClipboard(`${I} ${O}`), r.toast(f.uiStrings?.[f.currentLang]?.toast_copied || "Copied", "success");
        });
        let H = L("hapticToggle");
        H && (H.checked = !!f.isHapticEnabled, H.onchange = async () => {
            let {Prefs: x} = s();
            f.isHapticEnabled = !!H.checked, await x.set("isHapticEnabled", f.isHapticEnabled ? "true" : "false");
        });
        let N = L("installAppBtn");
        if (N) {
            N.style.display = "none";
            let x = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || !!window.navigator.standalone, $ = window.Capacitor && typeof window.Capacitor.isNativePlatform == "function" ? window.Capacitor.isNativePlatform() : !1, I = navigator.userAgent || "", O = (/iPad|iPhone|iPod/.test(I) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) && /WebKit/i.test(I) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(I);
            x || $ ? N.style.display = "none" : (O && (N.style.display = "flex"), window.addEventListener("beforeinstallprompt", q => {
                q.preventDefault(), f.deferredInstallPrompt = q, N.style.display = "flex";
            }), window.addEventListener("appinstalled", () => {
                f.deferredInstallPrompt = null, N.style.display = "none";
            }), N.onclick = async q => {
                if (q.stopPropagation(), f.deferredInstallPrompt) {
                    f.deferredInstallPrompt.prompt();
                    try {
                        (await f.deferredInstallPrompt.userChoice).outcome === "accepted" && (N.style.display = "none");
                    } catch {}
                    f.deferredInstallPrompt = null;
                    return;
                }
                if (O) {
                    let V = f.uiStrings?.[f.currentLang]?.install_ios_step1 || "Tap the Share icon at the bottom", j = f.uiStrings?.[f.currentLang]?.install_ios_step2 || "Select 'Add to Home Screen'", Q = `\n                        <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">\n                            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">\n                                <svg style="width:24px; height:24px; color:#3b82f6; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>\n                                </svg>\n                                <span style="font-size:0.9rem; font-weight:600; text-align:start;">1. ${V}</span>\n                            </div>\n                            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">\n                                <svg style="width:24px; height:24px; color:inherit; opacity:0.7; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>\n                                </svg>\n                                <span style="font-size:0.9rem; font-weight:600; text-align:start;">2. ${j}</span>\n                            </div>\n                        </div>\n                    `;
                    r.info(Q, {
                        isHtml: !0
                    });
                    return;
                }
                let z = f.uiStrings?.[f.currentLang]?.install_help || "To install: open your browser menu and choose 'Add to Home Screen'.";
                r.info(z);
            });
        }
    }
    var at = D(() => {
        se();
        le();
    });
    var mt = ot(() => {
        Ie();
        ye();
        $e();
        Me();
        He();
        De();
        qe();
        Oe();
        We();
        Ve();
        se();
        le();
        et();
        rt();
        at();
        (() => {
            let s = new Set([ "en", "ar", "fr", "it", "es" ]), t = (v, k = document) => Array.from(k.querySelectorAll(v));
            async function r(v, k = {}) {
                let {timeout: M = 5e3} = k, T = new AbortController, P = setTimeout(() => T.abort(), M);
                try {
                    let H = await fetch(v, {
                        ...k,
                        signal: T.signal
                    });
                    return clearTimeout(P), H;
                } catch (H) {
                    throw clearTimeout(P), H;
                }
            }
            async function e() {
                let v = window.Capacitor;
                if (v && typeof v.isNativePlatform == "function" && v.isNativePlatform()) return;
                let k = navigator.storage;
                if (!(!k || typeof k.persist != "function")) try {
                    if (typeof k.persisted == "function" && await k.persisted()) return;
                    await k.persist();
                } catch {}
            }
            function a() {
                let k = (navigator.language || "en").toLowerCase().split("-")[0];
                return s.has(k) ? k : "en";
            }
            async function n() {
                let v = A.get("userLang");
                if (v && s.has(v)) return v;
                if (!v) {
                    let k = a();
                    return await A.set("userLang", k), k;
                }
                return await A.set("userLang", "en"), "en";
            }
            let o = Te(() => f.isHapticEnabled), i = (() => {
                async function v(k) {
                    let M = window.Capacitor;
                    if (!M || !M.isNativePlatform()) return;
                    let T = M.Plugins?.StatusBar;
                    if (T) try {
                        await T.setStyle({
                            style: k ? "DARK" : "LIGHT"
                        });
                    } catch {}
                }
                return {
                    setStyle: v
                };
            })(), c = Pe(() => ({
                App: f,
                Prefs: A,
                MAIN_CATEGORIES: ie,
                UI: _,
                Streak: u,
                Reminders: W,
                HapticsEngine: o,
                syncNavEffects: ce
            }));
            Ge(c);
            let l = Ue(() => ({
                App: f,
                Prefs: A,
                HapticsEngine: o,
                UI: _
            })), d = je(() => ({
                App: f,
                Prefs: A,
                Storage: c,
                UI: _
            })), u = Be(() => ({
                App: f,
                Prefs: A,
                WidgetSync: h,
                formatShortDate: Ye
            })), g = Ke(() => ({
                App: f,
                Storage: c,
                UI: _
            })), m = Ne(() => ({
                App: f,
                UI: _,
                CFG: p,
                projectUrl: b
            }));
            function y() {
                let v = window.Capacitor;
                return v ? typeof v.isNativePlatform == "function" ? v.isNativePlatform() : (typeof v.getPlatform == "function" ? v.getPlatform() : "web") !== "web" : !1;
            }
            async function S(v) {
                let k = window.Capacitor?.Plugins?.Browser;
                if (k?.open) try {
                    await k.open({
                        url: v
                    });
                    return;
                } catch {}
                window.open(v, "_blank", "noopener");
            }
            let h = {
                async requestUpdate() {
                    if (!y()) return;
                    let v = window.Capacitor?.Plugins?.WidgetUpdater;
                    if (v?.update) try {
                        await v.update();
                    } catch (k) {
                        console.warn("Widget update failed", k);
                    }
                }
            };
            function p(v, k = "") {
                return f.uiStrings?.[f.currentLang]?.[v] ?? f.uiStrings?.en?.[v] ?? k;
            }
            function b() {
                return String(p("website", "https://wird.open-waqf.org/")).replace(/\/+$/, "");
            }
            function E() {
                let v = p("apk_url", "");
                return v || `${b()}/app/wird.apk`;
            }
            function F() {
                return p("contact_email", "wird-app@proton.me");
            }
            let _ = Re(() => ({
                App: f,
                Prefs: A,
                Storage: c,
                HapticsEngine: o,
                AudioController: m,
                Favorites: l,
                Focus: g,
                MAIN_CATEGORIES: ie,
                isCategoryCompleteDynamic: we,
                normalizeText: Je,
                escapeHTML: oe,
                highlightText: Qe,
                isNativeCapacitor: y,
                openExternal: S,
                projectUrl: b,
                syncNavEffects: ce
            })), W = Fe(() => ({
                App: f,
                Prefs: A,
                Storage: c,
                UI: _
            }));
            function J() {
                return {
                    App: f,
                    Prefs: A,
                    Storage: c,
                    UI: _,
                    Reminders: W,
                    Focus: g,
                    Backup: d,
                    HapticsEngine: o,
                    AudioController: m,
                    Favorites: l,
                    Streak: u,
                    projectUrl: b
                };
            }
            async function U() {
                try {
                    let Q = function(w) {
                        let C = document.querySelector('meta[name="theme-color"]');
                        C || (C = document.createElement("meta"), C.name = "theme-color", document.head.appendChild(C)), 
                        C.content = w ? "#0f172a" : "#ffffff";
                    }, ee = function() {
                        j ? (document.body.classList.add("dark"), q && (q.innerText = "☀️")) : (document.body.classList.remove("dark"), 
                        q && (q.innerText = "🌙")), V && j ? document.body.classList.add("oled") : document.body.classList.remove("oled"), 
                        z && (z.checked = V), Q(j), i.setStyle(j);
                    };
                    await A.migrate(), await A.loadAll(), await e(), f.currentLang = await n(), f.showDetails = A.get("showDetails") === "true", 
                    f.isKidsMode = A.get("isKidsMode") === "true", f.isHapticEnabled = A.get("isHapticEnabled") !== "false";
                    try {
                        f.favorites = JSON.parse(A.get("wird_favorites") || "[]");
                    } catch {
                        f.favorites = [];
                    }
                    document.documentElement.lang = f.currentLang, document.documentElement.dir = f.currentLang === "ar" ? "rtl" : "ltr";
                    try {
                        let R = (await (await r("sw.js")).text()).match(/CACHE_NAME\s*=\s*["']([^"']+)["']/), G = R ? R[1] : "Unknown Version";
                        console.log(`✅ Wird App Script [${G}] Loaded`);
                        let re = L("appVersion");
                        re && (re.innerText = G.replace("wird-", ""));
                    } catch {
                        console.log("✅ Wird App Script Loaded (Dev Mode)");
                    }
                    let v = new URLSearchParams(window.location.search), k = v.get("lang");
                    k && s.has(k) && (await A.set("userLang", k), f.currentLang = k);
                    let M = window.Capacitor?.Plugins?.App;
                    M && M.addListener("backButton", ({canGoBack: w}) => {
                        let C = L("focusModal"), R = L("settingsModal");
                        C && !C.classList.contains("hidden") ? g.close() : R && !R.classList.contains("hidden") ? (R.classList.add("hidden"), 
                        R.classList.add("opacity-0")) : w ? window.history.back() : M.exitApp();
                    });
                    let T, P;
                    try {
                        [T, P] = await Promise.all([ r("data.json"), r("strings.json") ]);
                    } catch (w) {
                        console.error("Data load failed, using empty defaults", w), T = null, P = null;
                    }
                    T ? f.adhkarData = await T.json() : f.adhkarData = [];
                    let H = null;
                    try {
                        H = P ? await P.json() : null;
                    } catch {
                        H = null;
                    }
                    if (f.uiStrings = {}, H) {
                        let w = H.default || {};
                        Object.keys(H).forEach(C => {
                            C !== "default" && (f.uiStrings[C] = {
                                ...w,
                                ...H[C]
                            });
                        });
                    } else f.uiStrings.en = {};
                    f.uiStrings[f.currentLang] || (f.currentLang = "en", await A.set("userLang", "en"));
                    let N = v.get("verify");
                    if (N) {
                        let w = f.adhkarData.find(C => C.id === N);
                        if (w?.verify_url) {
                            y() ? await S(w.verify_url) : window.location.href = w.verify_url;
                            return;
                        }
                    }
                    let x = [ "morning", "evening", "waking", "sleep", "favorites" ], $ = v.get("adhkar");
                    if ($) {
                        let w = f.adhkarData.find(C => C.id === $);
                        if (w) {
                            f.isKidsMode && !w.is_kids && (f.isKidsMode = !1, await A.set("isKidsMode", "false")), 
                            _.toast(f.uiStrings[f.currentLang]?.kids_mode_disabled_link || "Kids Mode was turned off to show this link.", "info", 3500);
                            let R = (Array.isArray(w.category) ? w.category : [ w.category ]).find(G => x.includes(G));
                            R && (f.currentCategory = R), f.pendingScrollToAdhkarId = $, window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    }
                    let I = v.get("category");
                    if (I && x.includes(I)) f.currentCategory = I, window.history.replaceState({}, document.title, window.location.pathname); else {
                        let w = (new Date).getHours();
                        w >= 4 && w < 13 ? f.currentCategory = "morning" : w >= 13 && w < 20 ? f.currentCategory = "evening" : f.currentCategory = "sleep";
                    }
                    let K = L("contactBtn");
                    if (K) {
                        let w = F();
                        K.href = `mailto:${w}`, K.addEventListener("click", C => {
                            y() && (C.preventDefault(), S(`mailto:${w}`));
                        });
                    }
                    let O = L("apkDownloadLink");
                    if (O) if (y()) O.closest("div").style.display = "none"; else {
                        let w = E();
                        O.href = w, O.addEventListener("click", C => {
                            y() && (C.preventDefault(), S(w));
                        });
                    }
                    let q = L("themeToggle"), z = L("oledToggle"), V = A.get("oledMode") === "true", j = A.get("darkMode") === "true";
                    q && (q.onclick = async () => {
                        j = !j, await A.set("darkMode", String(j)), ee();
                    }), z && (z.onchange = async w => {
                        V = w.target.checked, await A.set("oledMode", String(V)), V && !j && (j = !0, await A.set("darkMode", "true")), 
                        ee();
                    });
                    let B = L("langSelect");
                    B && (B.value = f.currentLang), f.uiStrings[f.currentLang]?.app_name && (document.title = f.uiStrings[f.currentLang].app_name + " - " + (f.uiStrings[f.currentLang][f.currentCategory] || "Adhkar")), 
                    ee(), _.applyUITranslations(), f.checkFestivals(), _.render(!1), _.updateCategoryUI(), 
                    f.pendingScrollToAdhkarId && setTimeout(() => {
                        let w = f.pendingScrollToAdhkarId, C = re => window.CSS && CSS.escape ? CSS.escape(re) : String(re).replace(/"/g, '\\"'), G = document.querySelector(`[data-id="${C(w)}"]`)?.closest(".adhkar-card");
                        G && (G.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        }), G.classList.add("ring-2", "ring-emerald-400", "ring-offset-2", "ring-offset-white", "dark:ring-offset-slate-900"), 
                        setTimeout(() => {
                            G.classList.remove("ring-2", "ring-emerald-400", "ring-offset-2", "ring-offset-white", "dark:ring-offset-slate-900");
                        }, 2e3)), f.pendingScrollToAdhkarId = null;
                    }, 300), setTimeout(() => {
                        _.scrollToActiveCategory();
                    }, 300), ce(), _.initFontSize(), _.initVoiceSpeed(), tt(), m.init(), await W.init(), 
                    await u.awardForToday();
                } catch (v) {
                    console.error("Init error:", v);
                }
            }
            (async () => (await U(), nt(J), Ze(J)))();
        })();
    });
    mt();
})();