var moment  = require("moment");

var Pathway = function (owner, readtoken, writetoken, maxPayloads, maxReferences) {
    this.owner = owner;
    this.readtoken = readtoken;
    this.writetoken = writetoken;
    this.maxPayloads = maxPayloads;
    this.maxReferences = maxReferences;
    this.readsize = 0;
    this.writesize = 0;
    this.readdenytally = 0;
    this.readtally = 0;
    this.writedenytally = 0;
    this.writetally = 0;
    this.payloads = [ ];
    this.references = { };
    this.lastread = moment("19000101");
    this.lastwrite = moment("19000101");
    this.started = moment();
}

Pathway.prototype.GetReadToken = function() {
    return this.readtoken;
}
Pathway.prototype.GetWriteToken = function() {
    return this.writetoken;
}
Pathway.prototype.GetReadTally = function() {
    return this.readtally;
}
Pathway.prototype.GetReadDenyTally = function() {
    return this.readdenytally;
}
Pathway.prototype.GetWriteTally = function() {
    return this.writetally;
}
Pathway.prototype.GetWriteDenyTally = function() {
    return this.writedenytally;
}
Pathway.prototype.GetReadSize = function() {
    return this.readsize;
}
Pathway.prototype.GetWriteSize = function() {
    return this.writesize;
}
Pathway.prototype.GetReferenceCount = function() {
    return this.references ? Object.keys(this.references).length : 0;
}
Pathway.prototype.GetPayloadCount = function() {
    return this.payloads.length;
}
Pathway.prototype.ReadPayload = function() {
    if (this.payloads.length == 0)
    {
        return null;
    }
    var payload = this.payloads.shift();
    this.readsize += payload.content.length;
    this.readtally++;
    this.lastread = moment();
    return payload;
}
Pathway.prototype.WritePayload = function(payload) {
    this.payloads.push(payload);
    this.writetally++;
    this.writesize += payload.content.length;
    this.lastwrite = moment();
}
Pathway.prototype.CanAddReference = function(key) {
    return ((key in this.references) ? this.references.length : this.references.length + 1) <= maxReferences;
}
Pathway.prototype.GetReference = function(key, defaultValue) {
    return key in this.references ? this.references[key] : defaultValue;
}
Pathway.prototype.SetReference = function(key, value) {
    this.references[key] = value;
}
Pathway.prototype.DeleteReference = function(key) {
    if (key in this.references)
    {
        delete this.references[key];
    }
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
        lastread: moment(this.lastread).format("YYYY-MM-DDTHH:mm:ss"),
        lastwrite: moment(this.lastwrite).format("YYYY-MM-DDTHH:mm:ss"),
        started: moment(this.started).format("YYYY-MM-DDTHH:mm:ss")
    });
};
  
module.exports = Pathway;
