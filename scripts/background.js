/*
* License: AGPL-3
* Copyright 2016, Internet Archive
*/
var manifest = chrome.runtime.getManifest();
//Load version from Manifest.json file
var VERSION = manifest.version;
//Used to store the statuscode of the if it is a httpFailCodes
var globalStatusCode = "";
//List of exluded URLs
var excluded_urls = [
  "localhost",
  "0.0.0.0",
  "127.0.0.1"
];
var previous_RTurl = "";
var windowIdtest = 0;
var windowIdSingle = 0;
var WB_API_URL = "https://archive.org/wayback/available";
var contexts = [
  {
    name: "alexa",
    htmlUrl: "https://archive.org/services/context/alexa?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "domaintools",
    htmlUrl: chrome.runtime.getURL("domaintools.html") + "?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "tweets",
    htmlUrl: 'https://twitter.com/search?q=',
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "wbmsummary",
    htmlUrl: chrome.runtime.getURL("overview.html") + "?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "annotations",
    htmlUrl: chrome.runtime.getURL("annotation.html") + "?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "similarweb",
    htmlUrl: chrome.runtime.getURL("similarweb.html") + "?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  },
  {
    name: "tagcloud",
    htmlUrl: chrome.runtime.getURL("tagcloud.html") + "?url=",
    tab: 0,
    window: 0,
    tabContextName: 0
  }
];
// Function to check whether it is a valid URL or not
function isValidUrl(url) {
  for (var i = 0; i < excluded_urls.length; i++) {
    if (url.startsWith("http://" + excluded_urls[i]) || url.startsWith("https://" + excluded_urls[i])) {
      return false;
    }
  }
  return true;
}

function rewriteUserAgentHeader(e) {
  for (var header of e.requestHeaders) {
    if (header.name.toLowerCase() === "user-agent") {
      header.value = header.value + " Wayback_Machine_Chrome/" + VERSION + " Status-code/" + globalStatusCode;
    }
  }
  return { requestHeaders: e.requestHeaders };
}

function URLopener(open_url, url, wmAvailabilitycheck) {
  if (wmAvailabilitycheck === true) {
    wmAvailabilityCheck(url, function () {
      chrome.tabs.create({ url: open_url });
    }, function () {
      alert("URL not found");
    });
  } else {
    chrome.tabs.create({ url: open_url });
  }
}

/**
 * Close window callback
 */
chrome.windows.onRemoved.addListener(function (id) {
  var index = contexts.findIndex(e => e.window === id);
  if (index >= 0) {
    contexts[index].window = 0;
  }
});

/**
 * Close tab callback
 */
chrome.tabs.onRemoved.addListener(function (id) {
  var index = contexts.findIndex(e => e.tab === id);
  if (index >= 0) {
    contexts[index].tab = 0;
  }
});


chrome.webRequest.onBeforeSendHeaders.addListener(
  rewriteUserAgentHeader,
  { urls: [WB_API_URL] },
  ["blocking", "requestHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(function (details) {
  if (['net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED',
    'net::ERR_CONNECTION_TIMED_OUT', 'net::ERR_NAME_NOT_RESOLVED'].indexOf(details.error) >= 0 &&
    details.tabId > 0) {
    wmAvailabilityCheck(details.url, function (wayback_url, url) {
      chrome.tabs.update(details.tabId, { url: chrome.extension.getURL('dnserror.html') + "?wayback_url=" + wayback_url + "&page_url=" + url + "&status_code=" + details.statusCode });
    }, function () { });
  }
}, { urls: ["<all_urls>"], types: ["main_frame"] });

/**
* Header callback
*/
RTurl = "";
chrome.webRequest.onCompleted.addListener(function (details) {
  function tabIsReady(isIncognito) {
    var httpFailCodes = [404, 408, 410, 451, 500, 502, 503, 504, 509, 520, 521,
      523, 524, 525, 526];
    if (isIncognito === false && details.frameId === 0 &&
      httpFailCodes.indexOf(details.statusCode) >= 0 && isValidUrl(details.url)) {
      globalStatusCode = details.statusCode;
      wmAvailabilityCheck(details.url, function (wayback_url, url) {
        chrome.tabs.executeScript(details.tabId, {
          file: "scripts/client.js"
        }, function () {
          if (chrome.runtime.lastError && chrome.runtime.lastError.message.startsWith('Cannot access contents of url "chrome-error://chromewebdata/')) {
            chrome.tabs.update(details.tabId, { url: chrome.extension.getURL('dnserror.html') + "?wayback_url=" + wayback_url + "&page_url=" + url + "&status_code=" + details.statusCode });
          } else {
            chrome.tabs.sendMessage(details.tabId, {
              type: "SHOW_BANNER",
              wayback_url: wayback_url,
              page_url: details.url,
              status_code: details.statusCode
            });
          }
        });
      }, function () { });
    }
  }
  if (details.tabId > 0) {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      var tabsArr = tabs.map(tab => tab.id);
      if (tabsArr.indexOf(details.tabId) >= 0) {
        chrome.tabs.get(details.tabId, function (tab) {
          tabIsReady(tab.incognito);
        });
      }
    })
  }
}, { urls: ["<all_urls>"], types: ["main_frame"] });

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.message === 'openurl') {
    var page_url = message.page_url;
    var wayback_url = message.wayback_url;
    var url = page_url.replace(/https:\/\/web\.archive\.org\/web\/(.+?)\//g, '');
    var open_url = wayback_url + encodeURI(url);
    if (!page_url.includes('chrome://')) {
      if (message.method !== 'save') {
        URLopener(open_url, url, true);
      } else {
        chrome.tabs.create({ url: open_url });
      }
    }
  } else if (message.message === 'makemodal') {
    RTurl = message.rturl;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      var url = RTurl;
      // utility function to run Radial Tree JS
      function _run_modalbox_scripts() {
        chrome.tabs.executeScript(tab.id, {
          file: "scripts/build.js"
        });
        chrome.tabs.executeScript(tab.id, {
          file: "scripts/RTcontent.js"
        });
        previous_RTurl = url;
      }
      //chrome debugger API  isn’t allowed to attach to any page in the Chrome Web Store
      if (url.includes('web.archive.org') || url.includes('web-beta.archive.org') || url.includes('chrome.google.com/webstore')) {
        alert("Structure as radial tree not available on this page");
      } else if ((previous_RTurl !== url && url === tab.url) || (previous_RTurl !== url && url !== tab.url)) {
        //Checking the condition for no recreation of the SiteMap and sending a message to RTContent.js
        chrome.tabs.sendMessage(tab.id, { message: "deletenode" });
        _run_modalbox_scripts();
      } else if (previous_RTurl === url) {
        _run_modalbox_scripts();
      }
    });
  } else if (message.message === 'sendurl') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { url: tabs[0].url });
    });
  } else if (message.message === 'sendurlforrt') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { RTurl: RTurl });
    });
  } else if (message.message === 'changeBadge') {
    //Used to change bage for auto-archive feature
    chrome.browserAction.setBadgeText({ tabId: message.tabId, text: "\u2713" });
  } else if (message.message === 'showall') {
    chrome.storage.sync.get(['show_context', 'auto_update_context', 'alexa', 'domaintools', 'tweets', 'wbmsummary', 'annotations', 'similarweb', 'tagcloud'], function (event) {
      if (!event.show_context) {
        //By-default the context-window open in tabs
        event.show_context = "tab";
      }
      var received_url = message.url;
      received_url = received_url.replace(/^https?:\/\//, '');
      var last_index = received_url.indexOf('/');
      //URL which will be using for alexa
      var url = received_url.slice(0, last_index);
      var alexa_url = "https://archive.org/services/context/alexa?url=" + url;
      //URL which will be needed for finding tweets
      var open_url = received_url;
      if (open_url.slice(-1) === '/') {
        open_url = received_url.substring(0, open_url.length - 1);
      }
      if (event.auto_update_context === undefined) {
        //By default auto-update context is off
        event.auto_update_context = false;
      }
      var urlsToAppend = [url, message.url, open_url, message.url, message.url, url, message.url];
      //If the Context is to be showed in tabs
      if (event.show_context === "tab") {
        if (contexts.findIndex(e => e.tab === 0) >= 0) {
          var p = Promise.resolve();
          for (var i = 0; i < contexts.length; i++) {
            var e = contexts[i];
            if (event[e.name]) {
              p = p.then(openThatContext(e.name, urlsToAppend[i], event.show_context));
            }
          }
        } else {
          //If context screens(tabs) are already opened and user again click on the Context button then update them
          chrome.tabs.query({
            windowId: windowIdtest
          }, function (tabs) {
            var tab = tabs[0];
          });
          for (var i = 0; i < contexts.length; i++) {
            var e = contexts[i];
            chrome.tabs.update(parseInt(e.tab), { url: e.htmlUrl + urlsToAppend[i] });
          }
        }
      } else if (event.show_context === "window") {
        //If the Context is to be showed in Windows
        if (contexts.findIndex(e => e.window === 0) >= 0) {
          //Checking if Windows are not open already
          var p = Promise.resolve();
          for (var i = 0; i < contexts.length; i++) {
            var e = contexts[i];
            if (event[e.name]) {
              p = p.then(openThatContext(e.name, urlsToAppend[i], event.show_context));
            }
          }
        } else {
          //If context screens(windows) are already opened and user again click on the Context button then update them
          for (var i = 0; i < contexts.length; i++) {
            var e = contexts[i];
            chrome.tabs.query({
              windowId: contexts[i].window
            }, function (tabs) {
              chrome.tabs.update(tabs[0].id, { url: e.htmlUrl + urlsToAppend[i] });
            });
          }
        }
      } else if (event.show_context === "singlewindow") {
        //If the Context is to be showed in singleWindow
        if (windowIdSingle !== 0) {
          //Checking if SingleWindow context is not open already
          chrome.tabs.query({
            windowId: windowIdSingle
          }, function (tabs) {
            chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL("singleWindow.html") + "?url=" + message.url });
          });
        } else {
          chrome.windows.create({
            url: chrome.runtime.getURL('singleWindow.html') + '?url=' + message.url,
            width: 1000, height: 1000, top: 0, left: 0, focused: false
          }, function (win) {
            windowIdSingle = win.id;
          });
        }
      }
    }); // closing chrome.storage.sync.get(['show_context', 'auto_update_context'],function(event){
  } // closing showall if
});

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.status === "complete") {
    chrome.tabs.get(tabId, function (tab) {
      chrome.storage.sync.get(['auto_archive'], function (event) {
        if (event.auto_archive === true) {
          auto_save(tab.id);
        }
      });
    });
  } else if (info.status === "loading") {
    chrome.tabs.get(tabId, function (tab) {
      var received_url = tab.url;
      if (!(received_url.includes("chrome://newtab/") || received_url.includes("chrome-extension://") || received_url.includes("alexa.com") || received_url.includes("whois.com") || received_url.includes("twitter.com") || received_url.includes("oauth"))) {
        singlewindowurl = received_url;
        tagcloudurl = new URL(singlewindowurl);
        received_url = received_url.replace(/^https?:\/\//, '');
        var last_index = received_url.indexOf('/');
        var url = received_url.slice(0, last_index);
        var open_url = received_url;
        if (open_url.slice(-1) === '/') {
          open_url = received_url.substring(0, open_url.length - 1);
        }
        var urlsToAppend = [url,tab.url, open_url, tab.url, tab.url, url, tagcloudurl];
        chrome.storage.sync.get(['books', 'auto_update_context', 'show_context'], function (event1) {
          if (event1.books === true) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              url = tabs[0].url;
              tabId = tabs[0].id;
              if (url.includes('www.amazon')) {
                fetch('https://archive.org/services/context/amazonbooks?url=' + url)
                  .then(resp => resp.json())
                  .then(resp => {
                    if (('metadata' in resp && 'identifier' in resp['metadata']) ||
                      'ocaid' in resp) {
                      chrome.browserAction.setBadgeText({ tabId: tabId, text: 'B' })
                    }
                  })
              }
            })
          }
          if (event1.auto_update_context === true) {
            if (event1.show_context === "tab") {
              if (contexts.findIndex(e => e.tab !== 0) >= 0 || windowIdtest !== 0) {
                chrome.tabs.query({
                  windowId: windowIdtest
                }, function (tabs) {
                  var tab1 = tabs[0];
                  tabIdtest = tab1.id;
                  if (tab.id !== tabIdtest && contexts.findIndex(e => e.tab !== tab.id) >= 0) {
                    for (var i = 0; i < contexts.length; i++) {
                      var e = contexts[i];
                      if ((tab1.url).includes(e.name)) {
                        chrome.tabs.update(parseInt(tabIdtest), { url: e.htmlUrl + urlsToAppend[i] });
                        break;
                      }
                    };
                    for (var i = 0; i < contexts.length; i++) {
                      var e = contexts[i];
                      chrome.tabs.update(parseInt(e.tab), { url: e.htmlUrl + urlsToAppend[i] });
                    };
                  }
                });
              }
            } else if (event1.show_context === "singlewindow") {
              chrome.tabs.query({
                windowId: windowIdSingle
              }, function (tabs) {
                var tab = tabs[0];
                chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("singleWindow.html") + "?url=" + singlewindowurl });
              });
            } else {
              if (contexts.findIndex(e => e.window !== 0) >= 0) {
                contexts.map(e => {
                  chrome.tabs.query({
                    windowId: e.window
                  }, function (tabs) {
                    if(tabs.length>0) e.tabContextName = tabs[0].id;
                  });
                });
                if (contexts.findIndex(e => e.tabContextName !== tab.id) >= 0) {
                for(var i=0;i<contexts.length;i++){
                    var e=contexts[i];
                    if(e.window!==0){
                      chrome.tabs.update(e.window+1, { url: e.htmlUrl+urlsToAppend[i] });
                    }
                  }
                }
              }
            }
          }
        }); // closing chrome.storage.sync.get(['books', 'auto_update_context', 'show_context'],function(event){
      }
    }); // closing chrome.tabs.get(tabId, function(tab) {
  } // closing if info.status ==="loading"
});

function auto_save(tabId) {
  chrome.tabs.get(tabId, function (tab) {
    var page_url = tab.url;
    chrome.browserAction.setBadgeText({ tabId: tabId, text: "" });
    if (isValidUrl(page_url) && isValidSnapshotUrl(page_url)) {
      if (!((page_url.includes("https://web.archive.org/web/")) || (page_url.includes("chrome://newtab")))) {
        wmAvailabilityCheck(page_url,
          function () {
            console.log("Available already");
          },
          function () {
            chrome.browserAction.setBadgeText({ tabId: tabId, text: "S" });
          });
      }
    }
  });
}

//function for opeing a particular context
function openThatContext(temp, url, methodOfShowing) {
  console.log("RECEIVED ", temp, url, methodOfShowing);
  return function () {
    return new Promise(function (resolve, reject) {
      var alexa_url = "https://archive.org/services/context/alexa?url=" + url;
      var twitter_search_url = 'https://twitter.com/search?q=' + url;
      if (methodOfShowing === 'tab') {
        if (windowIdtest === 0) {
          if (temp === 'domaintools') {
            chrome.windows.create({ url: chrome.runtime.getURL("domaintools.html") + "?url=" + url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'tweets') {
            chrome.windows.create({ url: 'https://twitter.com/search?q=' + url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'wbmsummary') {
            chrome.windows.create({ url: twitter_search_url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'annotations') {
            chrome.windows.create({ url: chrome.runtime.getURL("annotation.html") + "?url=" + url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'similarweb') {
            chrome.windows.create({ url: chrome.runtime.getURL("similarweb.html") + "?url=" + url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'tagcloud') {
            chrome.windows.create({ url: chrome.runtime.getURL("tagcloud.html") + "?url=" + url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          } else if (temp === 'alexa') {
            chrome.windows.create({ url: alexa_url, width: 800, height: 800, top: 0, left: 0, focused: true }, function (win) {
              windowIdtest = win.id;
              resolve();
            });
          }
        } else {
          chrome.tabs.query({
            windowId: windowIdtest
          }, function (tabs) {
            if (temp === 'alexa') {
              chrome.tabs.create({ 'url': alexa_url, 'active': false }, function (tab) {
                //tabId1 = tab.id;
                contexts[0].tab = tab.id;
                resolve();
              });
            } else if (temp === 'domaintools') {
              chrome.tabs.create({ 'url': chrome.runtime.getURL("domaintools.html") + "?url=" + url, 'active': false }, function (tab) {
                //tabId2 = tab.id;
                contexts[1].tab = tab.id;
                resolve();
              });
            } else if (temp === 'tweets') {
              chrome.tabs.create({ 'url': twitter_search_url, 'active': false }, function (tab) {
                //tabId3 = tab.id;
                contexts[2].tab = tab.id;
                resolve();
              });
            } else if (temp === 'wbmsummary') {
              chrome.tabs.create({ url: chrome.runtime.getURL("overview.html") + "?url=" + url, 'active': false }, function (tab) {
                //tabId4 = tab.id;
                contexts[3].tab = tab.id;
                resolve();
              });
            } else if (temp === 'annotations') {
              chrome.tabs.create({ url: chrome.runtime.getURL("annotation.html") + "?url=" + url, 'active': false }, function (tab) {
                //tabId5 = tab.id;
                contexts[4].tab = tab.id;
                resolve();
              });
            } else if (temp === 'similarweb') {
              chrome.tabs.create({ url: chrome.runtime.getURL("similarweb.html") + "?url=" + url, 'active': false }, function (tab) {
                //tabId6 = tab.id;
                contexts[5].tab = tab.id;
                resolve();
              });
            } else if (temp === 'tagcloud') {
              chrome.tabs.create({ url: chrome.runtime.getURL("tagcloud.html") + "?url=" + url, 'active': false }, function (tab) {
                //tabId7 = tab.id;
                contexts[6].tab = tab.id;
                resolve();
              });
            }
          });
        }
      } else if (methodOfShowing === 'window') {
        //If context is to be shown in window
        if (temp === 'alexa') {
          chrome.windows.create({ url: alexa_url, width: 500, height: 500, top: 0, left: 0, focused: false }, function (win) {
            //windowId1 = win.id;
            contexts[0].window=win.id;
            resolve();
          });
        } else if (temp === 'domaintools') {
          chrome.windows.create({ url: chrome.runtime.getURL("domaintools.html") + "?url=" + url, width: 500, height: 500, top: 500, left: 0, focused: false }, function (win) {
            //windowId2 = win.id;
            contexts[1].window=win.id;
            resolve();
          });
        } else if (temp === 'tweets') {
          chrome.windows.create({ url: twitter_search_url, width: 500, height: 500, top: 0, left: 500, focused: false }, function (win) {
            //windowId3 = win.id;
            contexts[2].window=win.id;
            resolve();
          });
        } else if (temp === 'wbmsummary') {
          chrome.windows.create({ url: chrome.runtime.getURL("overview.html") + "?url=" + url, width: 500, height: 500, top: 500, left: 500, focused: false }, function (win) {
            //windowId4 = win.id;
            contexts[3].window=win.id;
            resolve();
          });
        } else if (temp === 'annotations') {
          chrome.windows.create({ url: chrome.runtime.getURL("annotation.html") + "?url=" + url, width: 600, height: 500, top: 0, left: 1000, focused: false }, function (win) {
            //windowId5 = win.id;
            contexts[4].window=win.id;
            resolve();
          });
        } else if (temp === 'similarweb') {
          chrome.windows.create({ url: chrome.runtime.getURL("similarweb.html") + "?url=" + url, width: 600, height: 500, top: 0, left: 1200, focused: false }, function (win) {
            //windowId6 = win.id;
            contexts[5].window=win.id;
            resolve();
          });
        } else if (temp === 'tagcloud') {
          chrome.windows.create({ url: chrome.runtime.getURL("tagcloud.html") + "?url=" + url, width: 600, height: 500, top: 500, left: 1200, focused: false }, function (win) {
            //windowId7 = win.id;
            contexts[6].window=win.id;
            resolve();
          });
        }
      }
    });
  }
}

// Right-click context menu "Wayback Machine" inside the page.
chrome.contextMenus.create({
  'id': 'first',
  'title': 'First Version',
  'contexts': ['all'],
  'documentUrlPatterns': ['*://*/*', 'ftp://*/*']
});
chrome.contextMenus.create({
  'id': 'recent',
  'title': 'Recent Version',
  'contexts': ['all'],
  'documentUrlPatterns': ['*://*/*', 'ftp://*/*']
});
chrome.contextMenus.create({
  'id': 'all',
  'title': 'All Versions',
  'contexts': ['all'],
  'documentUrlPatterns': ['*://*/*', 'ftp://*/*']
});
chrome.contextMenus.create({
  'id': 'save',
  'title': 'Save Page Now',
  'contexts': ['all'],
  'documentUrlPatterns': ['*://*/*', 'ftp://*/*']
});
chrome.contextMenus.onClicked.addListener(function (click) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (['first', 'recent', 'save', 'all'].indexOf(click.menuItemId) >= 0) {
      const pattern = /https:\/\/web\.archive\.org\/web\/(.+?)\//g;
      const page_url = tabs[0].url.replace(pattern, '');
      let wayback_url;
      let wmAvailabilitycheck = true;
      if (click.menuItemId === 'first') {
        wayback_url = 'https://web.archive.org/web/0/' + encodeURI(page_url);
      } else if (click.menuItemId === 'recent') {
        wayback_url = 'https://web.archive.org/web/2/' + encodeURI(page_url);
      } else if (click.menuItemId === 'save') {
        wmAvailabilitycheck = false;
        wayback_url = 'https://web.archive.org/save/' + encodeURI(page_url);
      } else if (click.menuItemId === 'all') {
        wmAvailabilitycheck = false;
        wayback_url = 'https://web.archive.org/web/*/' + encodeURI(page_url);
      }
      URLopener(wayback_url, page_url, wmAvailabilitycheck);
    }
  });
});
