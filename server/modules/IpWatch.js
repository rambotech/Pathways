var moment = require("moment");

var IpWatch = function (isWhitelisted, attempts) 
{
    this.whitelisted = isWhitelisted;
    this.attempts = 0;
    this.latestAttemptTime = moment();
    this.methodCalls = 0;
    this.publicCalls = 0;
    this.invalidTokens = 0;
    }
IpWatch.prototype.IsWhitelisted = function () {
    return this.whitelisted;
}
IpWatch.prototype.GetInvalidTokensCount = function() {
    return this.invalidTokens;
}
IpWatch.prototype.InvalidToken = function(isInvalid) {
    this.invalidTokens = isInvalid ? (this.invalidTokens + 1) : 0;
}
IpWatch.prototype.MethodCall = function() {
    this.methodCalls++;
}
IpWatch.prototype.PublicCall = function() {
    this.publicCalls++;
}
IpWatch.prototype.GetAttempts = function() {
    return this.attempts;
}
IpWatch.prototype.GetLatestAttemptTime = function() {
    return this.latestAttemptTime;
}
IpWatch.prototype.SetLatestAttemptTime = function() {
    this.latestAttemptTime = moment();
}
IpWatch.prototype.IncrementAttempts = function() {
    this.latestAttemptTime = moment();
    this.attempts++;
}
IpWatch.prototype.GetPublicCallCount = function() {
    return this.publicCalls;
}
IpWatch.prototype.GetMethodCallCount = function() {
    return this.methodCalls;
}
IpWatch.prototype.Clear = function() {
    this.publicCalls = 0;
    this.methodCallFailCount = 0;
}
IpWatch.prototype.BuildJSON = function(ip) {
    return "\"" + ip + "\": " + JSON.stringify({
        isWhitelisted: this.isWhitelisted,
        publicCalls: this.publicCalls,
        methodCalls: this.methodCalls,
        invalidTokens: this.invalidTokens,
        attempts: this.attempts,
        latestAttemptTime: moment(this.latestAttemptTime).format("YYYY-MM-DDTHH:mm:ss"),
        blockedUntilTime: moment(this.latestAttemptTime).add(5 * this.invalidTokens, 's').format("YYYY-MM-DDTHH:mm:ss")
    });
}

module.exports = IpWatch;
