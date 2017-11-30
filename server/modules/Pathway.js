var moment  = require("moment");
var queuejs = require("queuejs");
var dict    = require("dict");

var readtoken = readtoken;
var writetoken = writetoken;
var maxPayloads = 50;
var maxReferences = 10;
var readsize = 0;
var readtally = 0;
var writesize = 0;
var writetallly = 0;
var payloads = new queuejs();
var references = new dict();
var lastread = Date.now;
var lastwrite = Date.now;
var started = Date.now;

var Pathway = function (readtoken, writetoken, maxPayloads, maxReferences) {
    this.readtoken = readtoken;
    this.writetoken = writetoken;
    this.maxPayloads = maxPayloads;
    this.maxReferences = maxReferences;
    this.readsize = 0;
    this.writesize = 0;
    this.readtally = 0;
    this.writetallly = 0;
}

Pathway.prototype.GetReadToken = function() {
    return this.readtoken;
}
Pathway.prototype.GetWriteToken = function() {
    return this.writetoken;
}
Pathway.prototype.GetReadTally = function() {
    return this.writetally;
}
Pathway.prototype.GetWriteTally = function() {
    return this.readtally;
}
Pathway.prototype.GetReadSize = function() {
    return this.writesize;
}
Pathway.prototype.GetWriteSize = function() {
    return this.readsize;
}
Pathway.prototype.GetReferenceCount = function() {
    return this.references ? Object.keys(this.references).length : 0;
}
Pathway.prototype.GetPayloadCount = function() {
    return this.payloads.size();
}
Pathway.prototype.ReadPayload = function() {
    if (this.payloads.size() == 0)
    {
        return null;
    }
    this.readtally++;
    this.readsize += this.payloads.peek().length;
    return this.payloads.deq();
}
Pathway.prototype.WritePayload = function(payload) {
    this.payloads.enq(payload);
    this.writetallly++;
    this.writesize += payload.length;
}
Pathway.prototype.GetReference = function(key, defaultValue) {
    return this.references.has(key) ? this.references.get(key) : defaultValue;
}
Pathway.prototype.SetReference = function(key, value) {
    this.references.set(key, value);
}
Pathway.prototype.DeleteReference = function(key) {
    this.references.delete(key);
}
Pathway.prototype.BuildJSON = function(id) {
    return "\"" + id + "\": " + JSON.stringify({
        readSize: this.readsize,
        readTally: this.readtally,
        writeSize: this.writesize,
        writeTally: this.writetally,
        payloadsAvailable: (this.payloads ? this.payloads.length : 0),
        maxPayloads: this.maxPayloads,
        referencesAvailable: (this.references ? Object.keys(this.references).length : 0),
        maxReferences: this.maxReferences,
        lastread: moment(this.lastread).toDate(),
        lastwrite: moment(this.lastwrite).toDate(),
        started: moment(this.started).toDate()
    });
};
  
module.exports = Pathway;
