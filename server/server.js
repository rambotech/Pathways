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
// intra-project packages
var Lockbox    = require('./modules/Lockbox.js');
var Pathway    = require("./modules/Pathway.js");
var IpWatch    = require("./modules/IpWatch.js");

// settings, which can also be overridden via the command line args
var adminAccessToken   = "b273ec13-13b7-4b65-a2af-bf9c71d0b422";  // change this default on the command line
var userAccessToken    = "a91a843b-a800-4af5-9d78-510cfe8fe4b0";  // change this default on the command line
var httpPortNumber = process.env.PORT || 5670;
var httpsPortNumber = (process.env.PORT + 1) || 5671;
var payloadSizeLimit =  2 * 1024 * 1024;
var pathwayMaximumPayloads = 50;
var pathwayMaximumReferences = 10;
var pathwayCountLimit = 20;
var totalPayloadSizeLimit = (400 * 1024 * 1024);
var loggingLevel = 0;

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
    var result = tokenValue == adminAccessToken ? 2 : (tokenValue == userAccessToken ? 1 : 0);
    IpWatchlist[ip].InvalidToken(result == 0);
    return result;
}

function LogTrace (message) { if (loggingLevel == 0) console.log(message); }
function LogDebug (message) { if (loggingLevel <= 1) console.log(message); }
function LogInfo (message) { if (loggingLevel <= 2) console.log(message); }
function LogWarning (message) { if (loggingLevel <= 3) console.log(message); }
function LogError (message) { if (loggingLevel <= 4) console.log(message); }

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
        "<p>Pathways RestAPI Server is open-source, written in express. Visit <a target='_blank' href='https://github.com/rambotech/DropShip'>this repository on GitHub</a> for more information.</p>" +
        "</body></html>";
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

// Stats for all pathways... requires admin access token in the header
router.get('/admin/pathway/summary', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /admin/pathway/summary )")
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
router.get('/pathway/stats/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/stats/:pathwayId )")
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

// Creates a new pathway, or recycles a deleted one ... requires user or admin access, and a JSON body argument
// 
// {
//     "readToken": "the key for reading",
//     "writeToken": "the key for reading",
//     "maxPayloads": 50,
//     "maxReferences": 10
// }
router.get('/pathway/create/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/create/:pathwayId )")
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
    if (Object.keys(PathwayList).length >= pathwayCountLimit)
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
    var maxPayloads = req.query.maxPayloads;
    var maxReferences = req.query.maxReferences;
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

router.get('/pathway/delete/:pathwayId', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/delete/:pathwayId )")
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

router.post('/pathway/:pathwayId/reference/set/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/:pathwayId/reference/set/:referenceKey )")
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
    if ((PathwayList[req.params.pathwayId].references ? Object.keys(PathwayList[req.params.pathwayId].references).length : 0) > pathwayMaximumReferences)
    {
        res.statusCode = 429
        res.statusMessage = "Too Many Requests";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    console.log(req.params.referenceKey);
    console.log(req.body);
    PathwayList[req.params.pathwayId].SetReference(req.params.referenceKey, req.body || "");
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end();
});

router.get('/pathway/:pathwayId/reference/get/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/:pathwayId/reference/get/:referenceKey )")
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
    var body = PathwayList[req.params.pathwayId].GetReference(req.params.referenceKey, "");
    console.log("Inspect: " + util.inspect(body, false, null));
    LogTrace("body: " + body);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.get('/pathway/:pathwayId/reference/delete/:referenceKey', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/:pathwayId/reference/delete/:referenceKey )")
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

router.get('/pathway/:pathwayId/payload/read', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/:pathwayId/payload/read )")
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
    if (PathwayList[req.params.pathwayId].GetPayloadCount() == 0)
    {
        res.statusCode = 204;
        res.statusMessage = "No Content";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    var lockbox = PathwayList[req.params.pathwayId].ReadPayload();
    totalPayloadSize -= lockbox.content.length;
    
    res.setHeader('Content-Type', lockbox.contentType);
    res.setHeader('Content-Length', lockbox.content.length);
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.end(body);
});

router.post('/pathway/:pathwayId/payload/write', function(req, res) {
    LogInfo(req.ip + ": Method call to ( /pathway/:pathwayId/payload/write )")
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
    LogDebug("PathwayList[req.params.pathwayId]: " + PathwayList[req.params.pathwayId])
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
    if (pathwayTokenLevel != 2) // requires read access token to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId].GetPayloadCount() >= PathwayList[req.params.pathwayId].maxPayloads)
    {
        res.statusCode = 429
        res.statusMessage = "Too many requests";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (req.body.length > payloadSizeLimit)
    {
        res.statusCode = 409
        res.statusMessage = "Payload over maximum size limit";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    if (totalPayloadSize + req.body.length > totalPayloadSizeLimit)
    {
        res.statusCode = 409
        res.statusMessage = "Payload exceeds total maximum payloads size cap";
        LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
        res.end();
        return;
    }
    console.log(req.body);
    PathwayList[req.params.pathwayId].WritePayload(new Lockbox(req.headers["content-type"], req.body));
    totalPayloadSize += req.body.length;
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
        IpWatchlist[ip] = new IpWatch(true, 0, Date.now);
    }
    totalPayloadSize = (0 * 1);
    
    var body = 'Pathways server is now at factory reset.';
    LogTrace(req.ip + ": " + res.statusCode + ": " + res.message);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
});

// Middleware 1: jailed IP check
// Middleware 2: post size violation check
// Middleware 3: access-token validation
// Body Parser for urlencoded
// Body Parser for JSON
// API routes (prefixed with /api)
app.use(function(req, res, next) {
    LogDebug(moment(Date.now()).toDate() +" :: Connection from " + req.ip);
    if (! IpWatchlist[req.ip])
    {
        LogTrace("Adding new client IP Address: " + req.ip);
        IpWatchlist[req.ip] = new IpWatch(false, 0, Date.now());
    }
    var ipInfo = IpWatchlist[req.ip];
    if (! ipInfo.IsWhitelisted)
    {
        var accessToken = req.header("Access-Token") || "()";
        if (ValidateAccessToken(req.ip, accessToken, false) != 2)
        {    
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
    }
    next();
})
.use(bodyParser.urlencoded({ extended: true }))
.use(bodyParser.json())
.use('/api', router);

// OVERRIDES from the command line, if any.
var target = "";
IpWatchlist["127.0.0.1"] = new IpWatch(true, 0, Date.now());
IpWatchlist["::1"] = new IpWatch(true, 0, Date.now());

process.argv.forEach(function(element) {
    if (element.length > 2 &&  element.substring(0,2) == "--")
    {
        target = element.substring(2);
    }
    else
    {
        if (target == "adminAccessToken") adminAccessToken = element;
        if (target == "userAccessToken") userAccessToken = element;
        if (target == "httpPortNumber") httpPortNumber = (1 * element);
        if (target == "httpsPortNumber") httpsPortNumber = (1 * element);
        if (target == "payloadSizeLimit") payloadSizeLimit = (1 * element);
        if (target == "pathwayMaximumPayloads") pathwayMaximumPayloads = (1 * element);
        if (target == "totalPayloadSizeLimit") totalPayloadSizeLimit = (1 * element);
        if (target == "loggingLevel") 
        {
            loggingLevel = (1 * element);
            if (loggingLevel < 0 || loggingLevel > 4)
            {
                loggingLevel = 2;
                console.log("Warning: loggingLevel is invalid (i.e. not 0 <= x <= 4).  Using default of 2 (Info)");
            }
        }
        if (target == "ipWhitelist")
        {
            if (! IpWatchlist[element])
            {
                IpWatchlist[element] = new IpWatch(true, 0, Date.now());;
            }
        } 
        target = "";
    }
}, this);

console.log('Magic happens on port ' + httpPortNumber + " (http) and " + httpsPortNumber + " (https)");
console.log('IP client whitelist addresses:');
for (var key in IpWatchlist)
{
    console.log('... ' + key);
}
console.log('adminAccessToken: ' + adminAccessToken);
console.log('userAccessToken: ' + userAccessToken);
console.log('payloadSizeLimit: ' + payloadSizeLimit);
console.log('pathwayMaximumPayloads: ' + pathwayMaximumPayloads);
console.log('pathwayCountLimit: ' + pathwayCountLimit);
console.log('totalPayloadSizeLimit: ' + totalPayloadSizeLimit);
console.log('loggingLevel: ' + loggingLevel);
// START THE SERVER
// =============================================================================
app.listen(httpPortNumber);
https.createServer(httpsOptions, app).listen(httpsPortNumber);
console.log("Pathways server is now running and accepting connections.");
console.log("==================================================================");
