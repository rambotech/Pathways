var moment     = require("moment");

var isWhitelisted = false;
var methodCalls = 0;
var publicCalls = 0;
var methodCallFailCount = 0;
var attempts = 0;
var latestattempt = 1;

var IpWatch = function (isWhitelisted, attempts, latestattempt) 
{
    this.isWhitelisted = isWhitelisted;
    this.attempts = 0;
    this.latestattempt = latestattempt;
}
IpWatch.prototype.isWhitelisted = function () {
    return this.isWhitelisted;
}
IpWatch.prototype.methodCallFailCount = function() {
    return this.methodCallFailCount;
}
IpWatch.prototype.MethodCallFailed = function() {
    if (! this.isWhitelisted)
    {
        this.methodCallFailCount++;
    }
}
IpWatch.prototype.MethodCallSucceeded = function() {
    if (! this.isWhitelisted)
    {
        this.methodCallFailCount = 0;
    }
}
IpWatch.prototype.getAttempts = function() {
    return this.attempts;
}
IpWatch.prototype.incrementAttempts = function() {
    this.attempts++;
}
IpWatch.prototype.PublicCall = function() {
    if (! this.isWhitelisted)
    {
        this.publicCalls++;
    }
}
IpWatch.prototype.Clear = function() {
    this.publicCalls = 0;
    this.methodCallFailCount = 0;
}
IpWatch.prototype.getLatestAttemptTime = function() {
    return moment(this.latestattempt).toDate();
}
IpWatch.prototype.setLatestAttemptTime = function(latestattempt) {
    this.latestattempt = latestattempt;
}
IpWatch.prototype.buildJSON = function(ip) {
    return "\"" + ip + "\": " + JSON.stringify({
        isWhitelisted: this.isWhitelisted,
        publicCalls: this.publicCalls,
        methodCalls: this.methodCalls,
        methodCallFailCount: this.methodCallFailCount,
        latestattempt: moment(this.latestattempt).toDate()
    });
}

module.exports = IpWatch;