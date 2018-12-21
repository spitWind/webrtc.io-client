# webrtc.io [![Build Status](https://travis-ci.org/webRTC/webrtc.io-client.png?branch=master)](https://travis-ci.org/webRTC/webrtc.io-client)

A library that is to webRTC like socket.io is to WebSockets.

This will eventually be bundled with the [server code](https://github.com/webRTC/webRTC.io).

## Installation

Currently, webrtc.io depends on socket.io, so include the socket.io client as well. After including socket.io-client, drop in `lib/io.js`. You'll also need a webrtc.io server running.

Now you can start using webRTC commands with our abstraction.


## Usage

```javascript
rtc.createStream({"video": true, "audio":true}, function(stream){
  // get local stream for manipulation
}
rtc.connect('ws://yourserveraddress:8001', optionalRoom);
//then a bunch of callbacks are available
```

You can set the STUN server by calling 
rtc.SERVER = "STUN stun.l.google.com:19302" and set your server. The default STUN server used by the library is one from google.


###  授权
 自由使用, 但不得用于商业用途以及 MIT 协议源码