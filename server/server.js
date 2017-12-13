// server.js

// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require("express");        // call express

var https      = require("https");
var app        = express();                 // define our app using express
var bodyParser = require("body-parser");
var dict       = require("dict");
var fs         = require("fs");
var moment     = require("moment");
var regex      = require("regex");
var util       = require("util");

// intra-project
var Lockbox    = require('./modules/Lockbox.js');
var Pathway    = require("./modules/Pathway.js");
var IpWatch    = require("./modules/IpWatch.js");
var Settings   = require("./modules/Settings.js");

// settings, which can also be overridden via the command line args

var settings = new Settings();

/////////////////////////////////////////
// Locals
var IpWatchlist       = { };    // IP address, details.
var PathwayList       = { };    // Name, pathway_obj 
var totalPayloadSize  = 0;
/////////////////////////////////////////

var key = fs.readFileSync('encryption/private.key');
var cert = fs.readFileSync('encryption/private.crt' );

var httpsOptions = {
    key: fs.readFileSync('encryption/private.key'),
    cert: fs.readFileSync('encryption/private.crt')
};

// Routes for this API
var router = express.Router();              // get an instance of the express Router

function ValidateAccessToken (ip, tokenValue)
{
    var result = tokenValue == settings.adminAccessToken ? 2 : (tokenValue == settings.userAccessToken ? 1 : 0);
    IpWatchlist[ip].InvalidToken(result == 0);
    return result;
}

function LogTrace (message) { if (settings.loggingLevel == 0) console.log(message); }
function LogDebug (message) { if (settings.loggingLevel <= 1) console.log(message); }
function LogInfo (message) { if (settings.loggingLevel <= 2) console.log(message); }
function LogWarning (message) { if (settings.loggingLevel <= 3) console.log(message); }
function LogError (message) { if (settings.loggingLevel <= 4) console.log(message); }

function ValidatePathwayToken(pathwayId, token)
{
    var result = 0;
    if (PathwayList[pathwayId])
    {
        if (PathwayList[pathwayId].GetReadToken() == token)
        {
            result = 1;
        }
        else if (PathwayList[pathwayId].GetWriteToken() == token)
        {
            result = 2;
        }
    }
    return result;
}

function IsInWhitelist (ip)
{
    var result = false;
    for (var key in IpWatchlist)
    {
        if (key == ip)
        {
            result = IpWatchlist[key].IsWhitelisted();
            break;
        }
    }
    return result;
}

function ValidateId(id)
{
    var isValid = true;
    for (var index = 0; isValid && index < id.length; index++)
    {
        var thisChar = id[index]; // id.substring(index,index);
        switch (index)
        {
            case 0: 
                isValid = (thisChar >= "A" && thisChar <= "Z") || (thisChar >= "a" && thisChar <= "z");
                break;

            default:
                isValid =
                    thisChar == "_" || thisChar == "-" || (thisChar >= "A" && thisChar <= "Z") || 
                    (thisChar >= "a" && thisChar <= "z") || (thisChar >= "0" && thisChar <= "9");
                break;
        }
    }
    return isValid;
}

// test route to make sure everything is working (accessed at GET http://{server}/api)
// no auth required.
router.get('/', function(req, res) {
    LogInfo(req.ip + ": Public call to ( / )")
    IpWatchlist[req.ip].PublicCall();
    var body = 
        "<html><head><title>Pathways RestAPI Server</title></head>" +
        "<p>This is a no-frills drop-off and pickup location for data packets between applications</p>" +
        "<p>Pathways RestAPI Server is open-source, written in express. Visit <a target='_blank' href='https://github.com/rambotech/Pathways'>this repository on GitHub</a> for more information.</p>" +
        "</body></html>";
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

// Stats for all pathways... requires admin access token in the header
router.get('/admin/pathways/summary', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/pathways/summary )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    switch (ValidateAccessToken(req.ip, accessToken))
    {
        case 0:
            res.statusCode = 401;
            res.statusMessage = "Not Authorized";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
            break;        
        case 1:
            res.statusCode = 403;
            res.statusMessage = "Forbidden";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
            break;
        case 2:
            if (Object.keys(PathwayList).length == 0)
            {
                res.statusCode = 204;
                res.statusMessage = "No Content";
                LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
                res.end();
            }
            else
            {
                var body = "{";
                for (var key in PathwayList)
                {
                    if (body.length > 1)
                    {
                        body += ",";
                    }
                    body += PathwayList[key].BuildJSON(key);
                }
                body += "}";
                LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Length', body.length);
                res.end(body);
            }
            break;
        default:
            LogError("Unknown access token level");
            res.statusCode = 500;
            res.statusMessage = "Internal Server Error";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
    }
});

// Stats for a specific pathway... requires admin access token in the header, and the read or write token in the header
// and the read token for the pathway.
router.get('/pathways/stats/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/stats/:pathwayId )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 204;
        res.statusMessage = "Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel == 0)
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.end();
        return;
    }
    var body = "{ " + PathwayList[req.params.pathwayId].BuildJSON(req.params.pathwayId) + "}";
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

// Creates a new pathway, or recycles a deleted one ... requires admin access, and these query arguments
//   readToken: the key for reading
//   writeToken: the key for reading
//   maxPayloads: the cap on payloads waiting for pickup
//   maxReferences: the cap on reference objects

router.get('/pathways/create/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/create/:pathwayId )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! ValidateId(req.params.pathwayId))
    {
        res.statusCode = 400;
        res.statusMessage = "Invalid pathway name";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (Object.keys(PathwayList).length >= settings.pathwayCountLimit)
    {
        res.statusCode = 429;
        res.statusMessage = "Too many requests";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId])
    {
        res.statusCode = 409;
        res.statusMessage = "Conflict";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var badParams = false;
    var pathwayId = req.params.pathwayId;
    var readToken = req.query.readToken;
    var writeToken = req.query.writeToken;
    var maxPayloads = parseInt(req.query.maxPayloads, 10);
    var maxReferences = parseInt(req.query.maxReferences, 10);
    badparams = ! readToken || ! writeToken || ! maxPayloads || ! maxReferences;
    if (badparams)
    {
        res.statusCode = 400;
        res.statusMessage = "Bad Request";
        res.end();
        return;
    }
    PathwayList[pathwayId] = new Pathway(readToken, writeToken, maxPayloads, maxReferences);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.get('/pathways/delete/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/delete/:pathwayId )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 204;
        res.statusMessage = "Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    delete PathwayList[req.params.pathwayId];
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.post('/pathways/:pathwayId/references/set/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/:pathwayId/references/set/:referenceKey )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! ValidateId(req.params.referenceKey))
    {
        res.statusCode = 400;
        res.statusMessage = "Invalid reference name";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel < 2) // requires write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var thisReferences = PathwayList[req.params.pathwayId].references;
    if ((thisReferences ? Object.keys(thisReferences).length : 0) > settings.pathwayMaximumReferences)
    {
        res.statusCode = 429
        res.statusMessage = "Too Many Requests";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var content = req.body;
    var contentType = req.contentType || req.headers["content-type"];
    LogTrace("content: " + content);
    LogTrace("contentType: " + contentType);
    PathwayList[req.params.pathwayId].SetReference(req.params.referenceKey, new Lockbox(contentType, content));
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.get('/pathways/:pathwayId/references/get/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/:pathwayId/references/get/:referenceKey )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel == 0) // requires read or write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var lockbox = PathwayList[req.params.pathwayId].GetReference(req.params.referenceKey, "");
    if (! lockbox)
    {
        res.statusCode = 204;
        res.statusMessage = " Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    LogTrace("reference read: " + JSON.stringify(lockbox));
    var content = lockbox.GetContent();
    var contentType = lockbox.GetContentType();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', content.length);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end(content);
});

router.get('/pathways/:pathwayId/references/delete/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/:pathwayId/references/delete/:referenceKey )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel < 2) // requires write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    PathwayList[req.params.pathwayId].DeleteReference(req.params.referenceKey);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.get('/pathways/:pathwayId/payloads/read', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/:pathwayId/payloads/read )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = "Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel != 1) // requires read access token to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId].payloads.length == 0)
    {
        res.statusCode = 204;
        res.statusMessage = "No Content";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var lockbox = PathwayList[req.params.pathwayId].ReadPayload();
    LogTrace("payload read: " + JSON.stringify(lockbox));
    var content = lockbox.GetContent();
    var contentType = lockbox.GetContentType();
    totalPayloadSize -= content.length;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', content.length);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end(content);
});

router.post('/pathways/:pathwayId/payloads/write', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathways/:pathwayId/payloads/write )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    LogDebug("pathwayId: " + (req.params.pathwayId || "{missing}"));
    LogTrace("PathwayList[req.params.pathwayId]: " + PathwayList[req.params.pathwayId])
    var thisPayload = PathwayList[req.params.pathwayId];
    if (! thisPayload)
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (pathwayTokenLevel != 2) // requires read access token to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (thisPayload.payloads.length >= thisPayload.maxPayloads)
    {
        res.statusCode = 429
        res.statusMessage = "Too many requests";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (req.body.length > settings.payloadSizeLimit)
    {
        res.statusCode = 409
        res.statusMessage = "Payload over maximum size limit";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (totalPayloadSize + req.body.length > settings.totalPayloadSizeLimit)
    {
        res.statusCode = 409
        res.statusMessage = "Payload exceeds total maximum size cap on all payloads for all pathways";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var content = req.body;
    var contentType = req.contentType || req.headers["content-type"];
    LogTrace("content: " + content);
    LogTrace("contentType: " + contentType);
    thisPayload.WritePayload(new Lockbox(contentType, content));
    totalPayloadSize += content.length;
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.get('/admin/clients', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/clients )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    switch (ValidateAccessToken(req.ip, accessToken))
    {
        case 0:
            res.statusCode = 401;
            res.statusMessage = "Not Authorized";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
            break;        
        case 1:
            res.statusCode = 403;
            res.statusMessage = "Forbidden";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
            break;
        case 2:
            var body = "{";
            for (var key in IpWatchlist)
            {
                if (body.length > 1)
                {
                    body += ",";
                }
                body += IpWatchlist[key].BuildJSON(key);
            }
            body += "}";
            //body = JSON.stringify(IpWatchlist);
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Length', body.length);
            res.end(body);
            break;
        default:
            res.statusCode = 500
            res.statusMessage = "Unrecognized access code";
            LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
            res.end();
            break;
    }
});

router.get('/admin/amnesty', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/amnesty )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    LogInfo("An admin at " + req.ip + " has pardoned the occupants in IP watch list.  Fly away and be free!");
    for (var ip in IpWatchlist)
    {
        IpWatchlist[ip].Clear();
    }
    
    var body = 'Pathway has cleared the current IP Blacklist.';
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
});

router.get('/admin/shutdown', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/shutdown )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    LogInfo("An admin at " + req.ip + " told me to shutdown.  Bye.");
    var body = 'Pathways server is shutting down.';
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
    process.exit(1);
});

router.get('/admin/reset', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/reset )")
    IpWatchlist[req.ip].MethodCall();
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    LogInfo("An admin at " + req.ip + " has reset the site to its startup state. All pathways and their contents have been dropped.");

    var whiteListIPs = [];
    for (var ip in IpWatchlist)
    {
        if (!IpWatchlist[ip].IsWhitelisted())
        {
            whiteListIPs.push(ip);
        }
    }

    PathwayList = { };
    IpWatchlist = { };
    for (var ip in whiteListIPs)
    {
        IpWatchlist[ip] = new IpWatch(true, 0);
    }
    totalPayloadSize = (0 * 1);
    
    var body = 'Pathways server is now at factory reset.';
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
});

// Middleware 1: jailed IP check
// Middleware 2+: handles for the body content
// API routes (prefixed with /api)
app.use(function(req, res, next) {
    LogDebug(moment(Date.now()).toDate() +" :: Connection from " + req.ip);
    if (! IpWatchlist[req.ip])
    {
        LogTrace("Adding new client IP Address: " + req.ip);
        IpWatchlist[req.ip] = new IpWatch(false, 0);
    }
    IpWatchlist[req.ip].latestAttemptTime = moment();
    var ipInfo = IpWatchlist[req.ip];
    if (! ipInfo.IsWhitelisted)
    {
        var accessToken = req.header("Access-Token") || "()";
        if (ValidateAccessToken(req.ip, accessToken, false) == 0)
        {
            IpWatchlist[req.ip].attempts++; 
            if (moment(ipInfo.getLatestAttemptTime()).add(IpWatchlist[req.ip].MethodCallFailed * 5, 's') > Date.now())
            {
                LogDebug("Rejecting jailed IP Address: " + req.ip);
                var body = "You're not playing nice";
                res.status = 451;
                res.statusMessage = "Too many failures; wait a while";
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Length', body.length);
                res.end(body);
                return;
            }
        }
        else
        {
            IpWatchlist[req.ip].attempts = 0;
        }
    }
    next();
})
.use(bodyParser.urlencoded({ extended: false }))
.use(bodyParser.text({ type: 'text/plain' }))
.use(bodyParser.json({ type: 'application/*+json' }))
.use('/api', router);

// command line parsing //
var target = "";
IpWatchlist["127.0.0.1"] = new IpWatch(true, 0);
IpWatchlist["::1"] = new IpWatch(true, 0);

process.argv.forEach(function(element) {
    if (element.length > 2 &&  element.substring(0,2) == "--")
    {
        target = element.substring(2);
    }
    else
    {
        if (target == "publicName") settings.publicName = element;
        if (target == "settingsFile")
        {
            settings.LoadConfigurationFile(element);
            console.log("reading from file");
        }
        if (target == "adminAccessToken") settings.adminAccessToken = element;
        if (target == "userAccessToken") settings.userAccessToken = element;
        if (target == "httpPortNumber") settings.httpPortNumber = (1 * element);
        if (target == "httpsPortNumber") settings.httpsPortNumber = (1 * element);
        if (target == "payloadSizeLimit") settings.payloadSizeLimit = (1 * element);
        if (target == "pathwayMaximumPayloads") settings.pathwayMaximumPayloads = (1 * element);
        if (target == "totalPayloadSizeLimit") settings.totalPayloadSizeLimit = (1 * element);
        if (target == "loggingLevel") 
        {
            settings.loggingLevel = (1 * element);
            if (settings.loggingLevel < 0 || settings.loggingLevel > 4)
            {
                settings.loggingLevel = 2;
                console.log("Warning: settings.loggingLevel is invalid (i.e. not 0 <= x <= 4).  Using default of 2 (Info)");
            }
        }
        if (target == "ipWhitelist")
        {
            if (! IpWatchlist[element])
            {
                IpWatchlist[element] = new IpWatch(true, 0);
            }
        } 
        target = "";
    }
}, this);

console.log('Magic happens on port ' + settings.httpPortNumber + " (http) and " + settings.httpsPortNumber + " (https)");
console.log('IP client whitelist addresses:');
for (var key in IpWatchlist)
{
    console.log('... ' + key);
}
console.log('adminAccessToken: ' + settings.adminAccessToken);
console.log('userAccessToken: ' + settings.userAccessToken);
console.log('payloadSizeLimit: ' + settings.payloadSizeLimit);
console.log('pathwayMaximumPayloads: ' + settings.pathwayMaximumPayloads);
console.log('pathwayCountLimit: ' + settings.pathwayCountLimit);
console.log('totalPayloadSizeLimit: ' + settings.totalPayloadSizeLimit);
console.log('loggingLevel: ' + settings.loggingLevel);

// START THE SERVER
// =============================================================================
app.listen(settings.httpPortNumber);
https.createServer(httpsOptions, app).listen(settings.httpsPortNumber);
console.log("Pathways server is now running and accepting connections.");
console.log("==================================================================");
