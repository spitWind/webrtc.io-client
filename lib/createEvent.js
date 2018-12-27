class CustomEvent {
  constructor() {
    /**
 * @type {{[key:string]:Function[]}}
 */
    this._events = {}
  }
  on(eventName, callback) {
    this._events[eventName] = this._events[eventName] || [];
    this._events[eventName].push(callback);
  }
  fire(eventName, _) {
    var events = this._events[eventName];
    var args = Array.prototype.slice.call(arguments, 1);

    if (!events) {
      return;
    }

    for (var i = 0, len = events.length; i < len; i++) {
      events[i].apply(null, args);
    }
  }
  static createEvent() {

    return new CustomEvent()
  }
}
module.exports = { createEvent: CustomEvent.createEvent, CustomEvent }