var { CustomEvent } = require("./createEvent")
const BYTES_PER_CHUNK = 1200;

class fileTranRtc extends CustomEvent {
  /**
   * Creates an instance of fileTranRtc.
   * @param {HTMLInputElement} element 
   */
  constructor(element) {
    super()
    this.element = element
    this.element.onchange = this.startUpload
    this.fileReader = new FileReader();
  }
  static readNextChunk(fileReader) {
    fileReader.currentChunk = fileReader.currentChunk || 0
    var start = BYTES_PER_CHUNK * (fileReader.currentChunk);
    var end = Math.min(file.size, start + BYTES_PER_CHUNK);
    fileReader.readAsArrayBuffer(file.slice(start, end));// 触发obload
  }
  onload() {
    p2pConnection.send(fileReader.result);
    currentChunk++;

    if (BYTES_PER_CHUNK * currentChunk < file.size) {
      fileTranRtc.readNextChunk();
    }
  }
  startUpload() {
    let fileReader = this.fileReader
    var file = this.element.files[0];
    currentChunk = 0;
    // send some metadata about our file
    // to the receiver
    // p2pConnection.send(JSON.stringify());
    let file = this.fileReader
    /*     cb({
          fileName: file.name,
          fileSize: file.size
        }) */
    // this.fire("")
    readNextChunk();
  };
}
module.exports = fileTranRtc