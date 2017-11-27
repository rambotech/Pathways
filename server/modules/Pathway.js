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
    return this.references.length;
}
Pathway.prototype.GetPayloadCount = function() {
    return this.payloads.length;
}
Pathway.prototype.ReadPayload = function() {
    if (this.payloads.length == 0)
    {
        return null;
    }
    return this.payloads.shift;
}
Pathway.prototype.WritePayload = function(payload) {
    this.payloads.push(payload);
}
Pathway.prototype.GetReference = function(key, defaultValue) {
    return key in this.references ? this.references[key] : defaultValue;
}
Pathway.prototype.SetReference = function(key, value) {
    this.references[key] = value;
}
Pathway.prototype.DeleteReference = function(key) {
    delete this.references[key];
}
Pathway.prototype.BuildJSON = function(id) {
    return "\"" + id + "\": " + JSON.stringify({
        readSize: this.readsize,
        readTally: this.readtally,
        writeSize: this.writesize,
        writeTally: this.writetally,
        payloadsAvailable: 0, //this.payloads.length,
        maxPayloads: this.maxPayloads,
        referencesAvailable: Object.keys(this.references).length,
        maxReferences: this.maxReferences,
        lastread: moment(this.lastread).toDate(),
        lastwrite: moment(this.lastwrite).toDate(),
        started: moment(this.started).toDate()
    });
};
  
module.exports = Pathway;
