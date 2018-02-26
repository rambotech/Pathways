# Pathways
Pathways is a Restful API server for passing data payloads between application instances.  The server is intentionally designed to be lightweight,
fast, use simple security... and to guarantee nothing.  The applications using Pathways server are responsible for tracking lost payloads, and determining how to reconcile them.

Pathways server is best thought of as implementing a UDP-style fire-and-forget protocol using http/https, but the receiver must request the payload when it is ready.  Thus timely reception by the receiver is never guaranteed.

Pathways does not support multiple point delivery.  It was designed for a fleet of work creators to distribute work on a pathway, and a fleet of work processors to compete for
those work items (i.e. first-come, first-serve) then return the results via a different pathway.  It is therefore well-suited to full-circle (client->server->client) fleet processing.

## Additional
The repository BOG.Pathways.Client contains a .NET Standard 2.0 client assembly, to communicate with a Pathways server.