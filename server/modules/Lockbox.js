// store content for both payloads and references
var moment = require("moment");

var Lockbox = function (contentType, content) 
{
    this.contentType = contentType;
    this.content = content;
}
Lockbox.prototype.GetContentType = function() {
    return this.contentType;
}
Lockbox.prototype.GetContent = function() {
    return this.content;
}

module.exports = Lockbox;
