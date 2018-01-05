var fs  = require("fs");

var Settings = function () 
{
    this.publicName = "Default";
    this.superAccessToken = "0a1fe9bc-7548-45ae-bebd-9263cf112e07";
    this.adminAccessToken = "36a1a42f-079b-4bde-8660-10b101465f22";
    this.userAccessToken = "9bcc39ce-0b6f-418f-9dbf-b7653d391cb1";
    this.httpPortNumber = 5670;
    this.httpsPortNumber = 5671;
    this.payloadSizeLimit = 524288;
    this.pathwayMaximumPayloads = 200;
    this.totalPayloadSizeLimit = 2147483648;
    this.loggingLevel = 2;
    this.ipWhitelist = [];
}

Settings.prototype.LoadConfigurationFile = function(settingsFile)
{
    var settingsJSON = null;
	if (!fs.existsSync(settingsFile))
	{
        console.log("Unable to find configuration file: " + settingsFile);
        process.exit(2);
	}
    try
    {
        settingsJSON = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    }
    catch (err)
    {
        console.log("The configuration file does not contain valid JSON");
        console.log(err);
        return false;
    }
	if (settingsJSON["publicName"]) this.publicName = settingsJSON["publicName"];
	if (settingsJSON["superAccessToken"]) this.superAccessTokenn = settingsJSON["superAccessToken"];
	if (settingsJSON["adminAccessToken"]) this.adminAccessToken = settingsJSON["adminAccessToken"];
	if (settingsJSON["userAccessToken"]) this.userAccessToken = settingsJSON["userAccessToken"];
	if (settingsJSON["httpPortNumber"]) this.httpPortNumber = settingsJSON["httpPortNumber"];
	if (settingsJSON["httpsPortNumber"]) this.httpsPortNumber = settingsJSON["httpsPortNumber"];
	if (settingsJSON["payloadSizeLimit"]) this.payloadSizeLimit = settingsJSON["payloadSizeLimit"];
	if (settingsJSON["pathwayMaximumPayloads"]) this.pathwayMaximumPayloads = settingsJSON["pathwayMaximumPayloads"];
	if (settingsJSON["totalPayloadSizeLimit"]) this.totalPayloadSizeLimit = settingsJSON["totalPayloadSizeLimit"];
	if (settingsJSON["loggingLevel"]) this.loggingLevel = settingsJSON["loggingLevel"];
    if (settingsJSON["ipWhitelist"])
    {
        for (var ip in settingsJSON["ipWhitelist"])
        {
            this.ipWhitelist.push(ip);
        }
    }
    return true;
}

module.exports = Settings;
