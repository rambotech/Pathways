var moment     = require("moment");

var isWhitelisted = false;
var attempts = 0;
var latestattempt = Date.now();
var readtally = 0;
var lastread = 1;
var writetally = 1;
var lastwrite = 1;

var Client = function (isWhitelisted) 
{
    this.isWhitelisted = isWhitelisted;
    this.attempts = 0;
    this.latestattempt = latestattempt;
    this.readtally = 0;
    this.lastread = 1;
    this.writetally = 1;
    this.lastwrite = 1;
}
Client.prototype.isWhitelisted =function () {
    return this.isWhitelisted;
}
Client.prototype.getReadTally = function() {
    return this.readtally;
}
Client.prototype.getLastRead = function() {
    return this.lastread;
}
Client.prototype.getWriteTally = function() {
    return this.writetally;
}
Client.prototype.getLastWrite = function() {
    return this.lastwrite;
}
Client.prototype.incrementRead = function() {
    this.readtally++;
}
Client.prototype.incrementWrite = function() {
    this.readwrite++;
}
Client.prototype.setLastWrite = function() {
    this.lastwrite = Date.now;
}
Client.prototype.setLastRead = function() {
    this.lastread = Date.now;
}
Client.prototype.getLatestAttemptTime = function() {
    return this.latestattempt;
}
Client.prototype.buildJSON = function(ip) {
    return "\"" + id + "\": " + JSON.stringify({
        ipaddress: ip,
        isWhitelisted: this.isWhitelisted,
        readtally: this.readtally,
        lastread: moment(this.lastread).toDate(),
        writetally: this.writetally,
        lastwrite: moment(this.lastwrite).toDate()
    });
}

module.exports = Client;