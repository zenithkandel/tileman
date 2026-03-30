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
    if (payload.includes('["put"')) {
      try {
        const data = JSON.parse(payload.substring(payload.indexOf('[')));
        // Send coordinates to content.js
        chrome.tabs.sendMessage(source.tabId, {
          type: 'RADAR_UPDATE',
          player: {
            id: data[1][0],
            x: data[1][1],
            y: data[1][2],
            isMe: false
          }
        });
      } catch (e) { }
    }
  }

  if (method === 'Network.webSocketFrameSent') {
    const payload = params.response.payloadData;
    if (payload.includes('["1"')) {
      try {
        const data = JSON.parse(payload.substring(payload.indexOf('[')));
        chrome.tabs.sendMessage(source.tabId, {
          type: 'RADAR_UPDATE',
          player: { x: data[1][1], y: data[1][2], isMe: true }
        });
      } catch (e) { }
    }
  }
});