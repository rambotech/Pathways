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

var Pathway    = require("./modules/Pathway.js");
var IpWatch    = require("./modules/IpWatch.js");

// settings, which can also be overridden via the command line args
var adminAccessToken   = "b273ec13-13b7-4b65-a2af-bf9c71d0b422";
var userAccessToken    = "a91a843b-a800-4af5-9d78-510cfe8fe4b0";
var httpPortNumber = process.env.PORT || 5670;
var httpsPortNumber = (process.env.PORT + 1) || 5671;
var payloadSizeLimit =  2 * 1024 * 1024;
var pathwayMaximumPayloads = 50;
var pathwayMaximumReferences = 10;
var pathwayCountLimit = 20;

/////////////////////////////////////////
// Locals
var IpWatchlist       = { };    // IP address, details.
var PathwayList       = { };    // Name, pathway_obj 
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
    IpWatchlist[ip].setLatestAttemptTime();
    var result = tokenValue == adminAccessToken ? 2 : (tokenValue == userAccessToken ? 1 : 0);
    if (result == 0)
    {
        IpWatchlist[ip].IpWatch.prototype.MethodCallFailed();
    }
    else
    {
        IpWatchlist[ip].MethodCallSucceeded();
    }
    return result;
}

function ValidatePathwayToken(pathwayId, token)
{
    var result = 0;
    if (PathwayList[pathwayId])
    {
        if (PathwayList[pathwayId].getReadToken() == token)
        {
            result = 1;
        }
        else if (PathwayList[pathwayId].getWriteToken() == token)
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
            result = IpWatchlist[key].GetIsWhitelisted();
            break;
        }
    }
    return result;
}

// test route to make sure everything is working (accessed at GET http://{server}/api)
// no auth required.
router.get('/', function(req, res) {
    IpWatchlist[req.ip].PublicCall();
    var body = 
        "<html><head><title>Pathways RestAPI Server</title></head>" +
        "<p>This is a no-frills drop-off and pickup location for data packets between applications</p>" +
        "<p>Pathways RestAPI Server is open-source, written in express. Visit <a target='_blank' href='https://github.com/rambotech/DropShip'>this repository on GitHub</a> for more information.</p>" +
        "</body></html>";
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

// Stats for all pathways... requires admin access token in the header
router.get('/admin/pathway/summary', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    switch (ValidateAccessToken(req.ip, accessToken))
    {
        case 0:
            res.statusCode = 401;
            res.statusMessage = "Not Authorized";
            res.end();
            break;        
        case 1:
            res.statusCode = 403;
            res.statusMessage = "Forbidden";
            res.end();
            break;
        case 2:
            var body = "{";
            for (var key in PathwayList)
            {
                if (body.length > 1)
                {
                    body += ",";
                }
                body += PathwayList[key].buildStats(key);
            }
            body += "}";
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Length', body.length);
            res.end(body);
            break;
        default:
            console.log ("Unknown access token level");
            res.statusCode = 500;
            res.statusMessage = "Internal Server Error";
            res.end();
    }
});

// Stats for a specific pathway... requires admin access token in the header, and the read or write token in the header
// and the read token for the pathway.
router.get('/pathway/stats/:pathwayId', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = "Not Found";
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
    var body = "{ " + PathwayList[req.params.pathwayId].buildStats(req.params.pathwayId) + "}";
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
router.post('/pathway/create/:pathwayId', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    if (AccessTokenLevel != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.end();
        return;
    }
    if (PathwayList.length >= pathwayCountLimit)
    {
        res.statusCode = 429;
        res.statusMessage = "Too many requests";
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId])
    {
        res.statusCode = 409;
        res.statusMessage = "Conflict";
        res.end();
        return;
    }
    var badParams = false;
    var pathwayId = req.params.pathwayId;
    var readToken = req.body.readToken;
    var writeToken = req.body.writeToken;
    var maxPayloads = req.body.maxPayloads;
    var maxReferences = req.body.maxReferences;
    badparams = ! readToken || ! writeToken || ! maxPayloads || ! maxReferences;
    if (badparams)
    {
        res.statusCode = 400;
        res.statusMessage = "Bad Request";
        res.end();
        return;
    }
    PathwayList[pathwayId] = new Pathway(readToken, writeToken, maxPayloads, maxReferences);
    var body = "{ " + PathwayList[pathwayId].buildStats(pathwayId) + "}";
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.get('/pathway/delete/:pathwayId', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = "Not Found";
        res.end();
        return;
    }
    delete PathwayList[req.params.pathwayId];
    res.end();
});

router.post('/pathway/:pathwayId/reference/set/:referenceKey', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        res.body = JSON.stringify({message: "Pathway not found"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (pathwayTokenLevel < 2) // requires write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.body = JSON.stringify({message: "Invalid or missing pathway token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId].references.length > pathwayMaximumReferences)
    {
        res.statusCode = 409
        res.statusMessage = "Conflict";
        res.body = JSON.stringify({message: "Reference count is at its maximum limit"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
        
    PathwayList[req.params.pathwayId].references[req.params.referenceKey] = req.body;
});

router.get('/pathway/:pathwayId/reference/get/:referenceKey', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        res.body = JSON.stringify({message: "Pathway not found"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (pathwayTokenLevel == 0) // requires read or write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.body = JSON.stringify({message: "Invalid or missing pathway token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    var body = PathwayList[req.params.pathwayId].references[req.params.referenceKey];
    body = body ? body : "";
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.get('/pathway/:pathwayId/reference/delete/:referenceKey', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        res.body = JSON.stringify({message: "Pathway not found"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (pathwayTokenLevel < 2) // requires write access to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.body = JSON.stringify({message: "Invalid or missing pathway token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    delete PathwayList[req.params.pathwayId].references[req.params.referenceKey];
    res.body = JSON.stringify({message: "Reference removed"});
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.get('/pathway/:pathwayId/payload/pull', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        res.body = JSON.stringify({message: "Pathway not found"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (pathwayTokenLevel != 1) // requires read access token to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.body = JSON.stringify({message: "Invalid or missing pathway token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    var body = PathwayList[req.params.pathwayId].readPayload();
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.post('/pathway/:pathwayId/payload/push', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    var AccessTokenLevel = ValidateAccessToken(req.ip, accessToken);
    var pathwayToken = req.header("Pathway-Token") || "()";
    var pathwayTokenLevel = ValidatePathwayToken(req.params.pathwayId, pathwayToken);
    if (AccessTokenLevel == 0)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        res.body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (! PathwayList[req.params.pathwayId])
    {
        res.statusCode = 404;
        res.statusMessage = " Not Found";
        res.body = JSON.stringify({message: "Pathway not found"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (pathwayTokenLevel != 2) // requires read access token to the pathway
    {
        res.statusCode = 403;
        res.statusMessage = "Forbidden";
        res.body = JSON.stringify({message: "Invalid or missing pathway token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        return;
    }
    if (PathwayList[req.params.pathwayId].payloads.length >= PathwayList[req.params.pathwayId].maxPayloads)
    {
        res.statusCode = 429
        res.statusMessage = "Too many requests";
        res.body = JSON.stringify({message: "Payload count is at its limit"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', res.body.length);
        res.end();
        res.end();
        return;
    }
    if (req.body.length > payloadSizeLimit)
    {
        res.statusCode = 409
        res.statusMessage = "Payload is over maximum size limit (" + payloadSizeLimit + ")";
        res.end();
        return;
    }
    PathwayList[req.params.pathwayId].writePayload(req.body);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);
});

router.get('/admin/clients', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    switch (ValidateAccessToken(req.ip, accessToken))
    {
        case 0:
            res.statusCode = 401;
            res.statusMessage = "Not Authorized";
            res.end();
            break;        
        case 1:
            res.statusCode = 403;
            res.statusMessage = "Forbidden";
            res.end();
            break;
        case 2:
            var body = "{";
            for (var key in IpWatchlist)
            {
                body += IpWatchlist[key].buildJSON(key);
            }
            body += "}";
            body = JSON.stringify(IpWatchlist);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Length', body.length);
            res.end(body);
            break;
        default:
            res.statusCode = 500
            res.statusMessage = "Unrecognized access code";
            break;
    }
});

router.get('/admin/amnesty', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        var body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', body.length);
        res.end();
        return;
    }
    console.log("An admin at " + req.ip + " has pardoned the occupants in IP watch list.  Fly away and be free!");
    for (var ip in IpWatchlist)
    {
        IpWatchlist[ip].clearAttempts();
    }
    
    var body = 'Pathway has cleared the current IP Blacklist.';
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
});

router.get('/admin/shutdown', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        var body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', body.length);
        res.end();
        return;
    }
    console.log("An admin at " + req.ip + " told me to shutdown.  Bye.");
    var body = 'Pathways server is shutting down.';
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', body.length);
    res.end(body);    
    process.exit(1);
});

router.get('/admin/reset', function(req, res) {
    var accessToken = req.header("Access-Token") || "()";
    if (ValidateAccessToken(req.ip, accessToken) != 2)
    {
        res.statusCode = 401;
        res.statusMessage = "Not Authorized";
        var body = JSON.stringify({message: "Invalid or missing access token"});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', body.length);
        res.end();
        return;
    }
    console.log("An admin at " + req.ip + " has reset the site to its startup state. All pathways and their contents have been dropped.");
    IpWatchlist = { };
    PathwayList = { };
    
    var body = 'Pathways server is now at factory reset.';
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
    console.log(moment(Date.now()).toDate() +" :: Connection from " + req.ip);
    if (! IpWatchlist[req.ip])
    {
        console.log("Adding as new client IP Address: " + req.ip);
        IpWatchlist[req.ip] = new IpWatch(IsInWhitelist(req.Ip), 0, Date.now());
    }
    var ipInfo = IpWatchlist[req.ip];
    var attempts = ipInfo.getAttempts();
    console.log("Client at " + req.ip + " last connected on " + moment(ipInfo.getLatestAttemptTime()).toDate());
    if (! IpWatchlist[req.ip].isWhitelisted)
    {
        var accessToken = req.header("Access-Token") || "()";
        if (ValidateAccessToken(req.ip, accessToken) != 2 || IpWatchlist[req.ip].GetIsWhitelisted())
        {    
            if (moment(ipInfo.getLatestAttemptTime()).add(attempts * 5, 's') > Date.now())
            {
                if (ipInfo.attempts < 100)
                {
                    ipInfo.incrementAttempts();
                }
                console.log("Rejecting jailed IP Address: " + req.ip);
                var body = "You're not playing nice";
                res.status = 451;
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

// OVERRIDE the admin and user keys, if provided on the command line.
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
        if (target == "httpPortNumber") httpPortNumber = element;
        if (target == "httpsPortNumber") httpsPortNumber = element;
        if (target == "payloadSizeLimit") payloadSizeLimit = element;
        if (target == "pathwayMaximumPayloads") pathwayMaximumPayloads = element;
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
// START THE SERVER
// =============================================================================
app.listen(httpPortNumber);
https.createServer(httpsOptions, app).listen(httpsPortNumber);
console.log("Pathways server is now running and accepting connections.");

