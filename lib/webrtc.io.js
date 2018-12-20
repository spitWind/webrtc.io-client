//CLIENT

// Fallbacks for vendor-specific variables until the spec is finalized.
/**
 * @type {typeof webkitRTCPeerConnection}
 */
var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
var nativeRTCIceCandidate = RTCIceCandidate
var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
var webkitMediaStream = window.webkitMediaStream || MediaStream
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true,
    voiceActivityDetection: true,
    iceRestart: true
  },
  iceServers: [{
    "url": "stun:127.0.0.1:8083"
  }]
};


if (navigator.webkitGetUserMedia) {
  if (!webkitMediaStream.prototype.getVideoTracks) {
    webkitMediaStream.prototype.getVideoTracks = function () {
      return this.videoTracks;
    };
    webkitMediaStream.prototype.getAudioTracks = function () {
      return this.audioTracks;
    };
  }

  // New syntax of getXXXStreams method in M26.
  if (!webkitRTCPeerConnection.prototype.getLocalStreams) {
    webkitRTCPeerConnection.prototype.getLocalStreams = function () {
      return this.localStreams;
    };
    webkitRTCPeerConnection.prototype.getRemoteStreams = function () {
      return this.remoteStreams;
    };
  }
}

(function () {

  var rtc = {
    // peerConnections
  };
  if ('undefined' === typeof module) {
    this.rtc = rtc;
  } else {
    module.exports = rtc
  }

  // Toggle debug mode (console.log)
  rtc.debug = false;
  rtc.sdpConstraints = sdpConstraints
  // Holds a connection to the server.
  /**
   * @type {WebSocket}
   */
  rtc._socket = null;

  // Holds identity for the client.
  rtc._me = null;

  rtc = Object.assign(rtc, createEvent())

  // Holds the STUN/ICE server to use for PeerConnections.
  rtc.SERVER = function () {
    console.log("获取相关配置")
    return {
      "iceServers": sdpConstraints.iceServers
    };
  };

  /**
   * @type {{[key:string]:webkitRTCPeerConnection}}
   */
  var peerConnectionsObj = {}
  // Reference to the lone PeerConnection instance.
  rtc.peerConnections = peerConnectionsObj;
  // Array of known peer socket ids
  rtc.connections = [];
  // Stream-related variables.
  rtc.streams = [];
  rtc.numStreams = 0;
  rtc.initializedStreams = 0;


  // Reference to the data channels
  rtc.dataChannels = {};

  // PeerConnection datachannel configuration
  rtc.dataChannelConfig = {
    "optional": [{
      "RtpDataChannels": true
    }, {
      "DtlsSrtpKeyAgreement": true
    }]
  };

  rtc.pc_constraints = {
    "optional": [{
      "DtlsSrtpKeyAgreement": true
    }]
  };


  // check whether data channel is supported.
  rtc.checkDataChannelSupport = function () {
    try {
      // raises exception if createDataChannel is not supported
      var pc = new PeerConnection(rtc.SERVER(), rtc.dataChannelConfig);
      var channel = pc.createDataChannel('supportCheck', {
        reliable: false
      });
      channel.close();
      return true;
    } catch (e) {
      return false;
    }
  };

  rtc.dataChannelSupport = rtc.checkDataChannelSupport();


  /**
   * Connects to the websocket server.
   */
  rtc.connect = function (server, room) {
    room = room || ""; // by default, join a room called the blank string
    rtc._socket = new WebSocket(server);

    rtc._socket.onopen = function () {

      rtc._socket.send(JSON.stringify({
        "eventName": "join_room",
        "data": {
          "room": room
        }
      }));

      rtc._socket.onmessage = function (msg) {
        var json = JSON.parse(msg.data);
        console.log("triget:" + json.eventName)
        rtc.fire(json.eventName, json.data);
      };

      rtc._socket.onerror = function (err) {
        console.error('onerror');
        console.error(err);
      };

      rtc._socket.onclose = function (data) {
        var id = rtc._socket.id;
        rtc.fire('disconnect stream', id);
        if (typeof (rtc.peerConnections[id]) !== 'undefined')
          rtc.peerConnections[id].close();
        delete rtc.peerConnections[id];
        delete rtc.dataChannels[id];
        delete rtc.connections[id];
      };

      rtc.on('get_peers', function (data) {
        rtc.connections = data.connections;
        rtc._me = data.you;
        if (rtc.offerSent) { // 'ready' was fired before 'get_peers'
          rtc.createPeerConnections();
          rtc.addStreams();
          rtc.addDataChannels();
          rtc.sendOffers();
        }
        // fire connections event and pass peers
        rtc.fire('connections', rtc.connections);
      });

      rtc.on('receive_ice_candidate', function (data) {
        console.log(data)
        var candidate = new nativeRTCIceCandidate(data);
        rtc.peerConnections[data.socketId].addIceCandidate(candidate).catch(
          console.error
        );
        rtc.fire('receive ice candidate', candidate);
      });

      rtc.on('new_peer_connected', function (data) {
        var id = data.socketId;
        rtc.connections.push(id);
        delete rtc.offerSent;

        var pc = rtc.createPeerConnection(id);
        for (var i = 0; i < rtc.streams.length; i++) {
          var stream = rtc.streams[i];
          pc.addStream(stream);
        }
      });

      rtc.on('remove_peer_connected', function (data) {
        var id = data.socketId;
        rtc.fire('disconnect stream', id);
        if (typeof (rtc.peerConnections[id]) !== 'undefined')
          rtc.peerConnections[id].close();
        delete rtc.peerConnections[id];
        delete rtc.dataChannels[id];
        delete rtc.connections[id];
      });

      rtc.on('receive_offer', function (data) {
        rtc.receiveOffer(data.socketId, data.sdp);
        rtc.fire('receive offer', data);
      });

      rtc.on('receive_answer', function (data) {
        rtc.receiveAnswer(data.socketId, data.sdp);
        rtc.fire('receive answer', data);
      });

      rtc.fire('connect');
    };
  };


  rtc.sendOffers = function () {
    for (var i = 0, len = rtc.connections.length; i < len; i++) {
      var socketId = rtc.connections[i];
      rtc.sendOffer(socketId);
    }
  };

  rtc.onClose = function (data) {
    rtc.on('close_stream', function () {
      rtc.fire('close_stream', data);
    });
  };

  rtc.createPeerConnections = function () {
    for (var i = 0; i < rtc.connections.length; i++) {
      rtc.createPeerConnection(rtc.connections[i]);
    }
  };

  rtc.createPeerConnection = function (id) {

    var config = rtc.pc_constraints;
    if (rtc.dataChannelSupport) config = rtc.dataChannelConfig;

    var pc = rtc.peerConnections[id] = new PeerConnection(rtc.SERVER(), config);
    pc.onicecandidate = function (event) {
      if (event.candidate) {
        rtc._socket.send(JSON.stringify({
          "eventName": "send_ice_candidate",
          "data": {
            "label": event.candidate.sdpMLineIndex,
            "candidate": event.candidate.candidate,
            "socketId": id
          }
        }));
      }
      rtc.fire('ice candidate', event.candidate);
    };

    pc.onopen = function () {
      // TODO: Finalize this API
      rtc.fire('peer connection opened');
    };

    pc.onaddstream = function (event) {
      // TODO: Finalize this API
      rtc.fire('add remote stream', event.stream, id);
    };

    if (rtc.dataChannelSupport) {
      pc.ondatachannel = function (evt) {
        if (rtc.debug)
          console.log('data channel connecting ' + id);
        rtc.addDataChannel(id, evt.channel);
      };
    }

    return pc;
  };

  rtc.sendOffer = function (socketId) {
    var pc = rtc.peerConnections[socketId];

    var constraints = {
      "optional": [],
      "mandatory": {
        "MozDontOfferDataChannel": true
      }
    };
    // temporary measure to remove Moz* constraints in Chrome
    if (navigator.webkitGetUserMedia) {
      for (var prop in constraints.mandatory) {
        if (prop.indexOf("Moz") != -1) {
          delete constraints.mandatory[prop];
        }
      }
    }
    constraints = mergeConstraints(constraints, sdpConstraints);
    //  兼容 谷歌56+
    pc.createOffer(sdpConstraints.mandatory).then(
      function (session_description) {
        pc.setLocalDescription(session_description).then(function () {
          // session_description.sdp = preferOpus(session_description.sdp);
          session_description.sdp = preferOpus(session_description.sdp);
          rtc._socket.send(JSON.stringify({
            "eventName": "send_offer",
            "data": {
              "socketId": socketId,
              "sdp": session_description
            }
          }));
        })
      })
  };

  rtc.receiveOffer = function (socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
    rtc.sendAnswer(socketId, sdp);
  };

  rtc.sendAnswer = function (socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
    if (sdp)
      pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
    pc.createAnswer(sdpConstraints.mandatory).then(
      (session_description) => {
        console.log(pc.localDescription)
        rtc._socket.send(JSON.stringify({
          "eventName": "send_answer",
          "data": {
            "socketId": socketId,
            "sdp": session_description
          }
        }));
      }
    );
  };


  rtc.receiveAnswer = function (socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
    pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));
  };


  rtc.createStream = function (opt, onSuccess, onFail) {
    var options;
    onSuccess = onSuccess || function () { };
    onFail = onFail || function () { };

    options = {
      video: !!opt.video,
      audio: !!opt.audio
    };

    if (getUserMedia) {
      rtc.numStreams++;
      getUserMedia.call(navigator, options, function (stream) {
        rtc.streams.push(stream);
        rtc.initializedStreams++;
        onSuccess(stream);
        if (rtc.initializedStreams === rtc.numStreams) {
          rtc.fire('ready');
        }
      }, function (error) {
        alert("Could not connect stream.");
        onFail(error);
      });
    } else {
      alert('webRTC is not yet supported in this browser.');
    }
  };

  rtc.addStreams = function () {
    for (var i = 0; i < rtc.streams.length; i++) {
      var stream = rtc.streams[i];
      for (var connection in rtc.peerConnections) {
        rtc.peerConnections[connection].addStream(stream);
      }
    }
  };
  /**
   * @type {function(MediaStream,string|HTMLVideoElement):void}
   */
  rtc.attachStream = function (stream, element) {
    if (typeof (element) === "string")
      element = document.getElementById(element);
    // document.createElement("video")
    if (navigator.mozGetUserMedia) {
      if (rtc.debug) console.log("Attaching media stream");
      element.mozSrcObject = stream;
      element.play();
    } else {
      element.srcObject = stream
      // element.src = webkitURL.createObjectURL(new MediaSource(stream));
    }
  };


  rtc.createDataChannel = function (pcOrId, label) {
    if (!rtc.dataChannelSupport) {
      //TODO this should be an exception
      alert('webRTC data channel is not yet supported in this browser,' +
        ' or you must turn on experimental flags');
      return;
    }

    var id, pc;
    if (typeof (pcOrId) === 'string') {
      id = pcOrId;
      pc = rtc.peerConnections[pcOrId];
    } else {
      pc = pcOrId;
      id = undefined;
      for (var key in rtc.peerConnections) {
        if (rtc.peerConnections[key] === pc) id = key;
      }
    }

    if (!id) throw new Error('attempt to createDataChannel with unknown id');

    if (!pc || !(pc instanceof PeerConnection)) throw new Error('attempt to createDataChannel without peerConnection');

    // need a label
    label = label || 'fileTransfer' || String(id);

    // chrome only supports reliable false atm.
    var options = {
      reliable: false
    };

    var channel;
    try {
      if (rtc.debug) console.log('createDataChannel ' + id);
      channel = pc.createDataChannel(label, options);
    } catch (error) {
      if (rtc.debug) console.log('seems that DataChannel is NOT actually supported!');
      throw error;
    }

    return rtc.addDataChannel(id, channel);
  };

  rtc.addDataChannel = function (id, channel) {

    channel.onopen = function () {
      if (rtc.debug) console.log('data stream open ' + id);
      rtc.fire('data stream open', channel);
    };

    channel.onclose = function (event) {
      delete rtc.dataChannels[id];
      delete rtc.peerConnections[id];
      delete rtc.connections[id];
      if (rtc.debug) console.log('data stream close ' + id);
      rtc.fire('data stream close', channel);
    };

    channel.onmessage = function (message) {
      if (rtc.debug) console.log('data stream message ' + id);
      rtc.fire('data stream data', channel, message.data);
    };

    channel.onerror = function (err) {
      if (rtc.debug) console.log('data stream error ' + id + ': ' + err);
      rtc.fire('data stream error', channel, err);
    };

    // track dataChannel
    rtc.dataChannels[id] = channel;
    return channel;
  };

  rtc.addDataChannels = function () {
    if (!rtc.dataChannelSupport) return;

    for (var connection in rtc.peerConnections)
      rtc.createDataChannel(connection);
  };


  rtc.on('ready', function () {
    rtc.createPeerConnections();
    rtc.addStreams();
    rtc.addDataChannels();
    rtc.sendOffers();
    rtc.offerSent = true;
  });

}).call(this);

function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex = null;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) return sdp;

  // If Opus is available, set it as the default in m line.
  for (var j = 0; j < sdpLines.length; j++) {
    if (sdpLines[j].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[j], /:(\d+) opus\/48000/i);
      if (opusPayload) sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return (result && result.length == 2) ? result[1] : null;
}

function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    if (elements[i] !== payload) newLine[index++] = elements[i];
  }
  return newLine.join(' ');
}

function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length - 1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

function mergeConstraints(cons1, cons2) {
  var merged = cons1;
  for (var name in cons2.mandatory) {
    merged.mandatory[name] = cons2.mandatory[name];
  }
  merged.optional.concat(cons2.optional);
  return merged;
}


function createEvent() {
  var constraints = {
    on: function (eventName, callback) {
      this._events[eventName] = this._events[eventName] || [];
      this._events[eventName].push(callback);
    },
    /**
     * @type {{[key:string]:Function[]}}
     */
    _events: {

    },
    fire: function (eventName, _) {
      var events = this._events[eventName];
      var args = Array.prototype.slice.call(arguments, 1);

      if (!events) {
        return;
      }

      for (var i = 0, len = events.length; i < len; i++) {
        events[i].apply(null, args);
      }
    }
  }
  return constraints
}