// Shows the usage alerts the page script asks for, as system notifications.
chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'quota-gauge-alert') return
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Claude usage',
    message: String(message.text),
  })
})
