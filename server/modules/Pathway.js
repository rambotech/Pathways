var moment     = require("moment");

var readtoken = readtoken;
var writetoken = writetoken;
var maxPayloads = 50;
var maxReferences = 10;
var readsize = 0;
var readtally = 0;
var writesize = 0;
var writetallly = 0;
var payloads = [ ];
var references = { };
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

Pathway.prototype.getReadToken = function() {
    return this.readtoken;
}
Pathway.prototype.getWriteToken = function() {
    return this.writetoken;
}
Pathway.prototype.getReadTally = function() {
    return this.writetally;
}
Pathway.prototype.getWriteTally = function() {
    return this.readtally;
}
Pathway.prototype.getReadSize = function() {
    return this.writesize;
}
Pathway.prototype.getWriteSize = function() {
    return this.readsize;
}
Pathway.prototype.getReferenceCount = function() {
    return this.references.length;
}
Pathway.prototype.getPayloadCount = function() {
    return this.payloads.length;
}
Pathway.prototype.countPayload = function() {
    return this.payloads.length;
}
Pathway.prototype.readPayload = function() {
    if (this.payloads.length == 0)
    {
        return null;
    }
    return this.payloads.shift;
}
Pathway.prototype.writePayload = function(payload) {
    this.payloads.push(payload);
}
Pathway.prototype.getReference = function(key, defaultValue) {
    return key in this.references ? this.references[key] : defaultValue;
}
Pathway.prototype.setReference = function(key, value) {
    this.references[key] = value;
}
Pathway.prototype.deleteReference = function(key) {
    delete this.references[key];
}
Pathway.prototype.buildStats = function(id) {
    return "\"" + id + "\": " + JSON.stringify({
        maxPayloads: this.maxPayloads,
        readSize: this.readsize,
        readTally: this.readtally,
        writeSize: this.writesize,
        writeTally: this.writetally,
        lastread: moment(this.lastread).toDate(),
        lastwrite: moment(this.lastwrite).toDate(),
        started: moment(this.started).toDate()
    });
};
  
module.exports = Pathway;