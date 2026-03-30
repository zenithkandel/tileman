chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.includes('tileman.io')) {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    });
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Network.webSocketFrameReceived') {
    const payload = params.response.payloadData;
    const tabId = source.tabId;

    try {
      const jsonStr = payload.substring(payload.indexOf('['));
      const data = JSON.parse(jsonStr);
      const eventType = data[0];

      // 1. Position Updates
      if (eventType === "put") {
        chrome.tabs.sendMessage(tabId, { type: 'PUT', data: data[1] });
      }
      // 2. Leaderboard (Names & Scores)
      else if (eventType === "lr") {
        chrome.tabs.sendMessage(tabId, { type: 'LEADERBOARD', data: data[1] });
      }
      // 3. Player Death/Removal
      else if (eventType === "pr") {
        chrome.tabs.sendMessage(tabId, { type: 'REMOVE', id: data[1].id });
      }
    } catch (e) { }
  }
});