# Pathways
Pathways is a Restful API server for passing data payloads between application instances.  The server is intentionally designed to be lightweight,
fast, use simple security... and to gaurantee nothing.

Pathways is intended for numerous instances to support data payload brokering between a sending application and a requesting application.  Both the sender
and the receiver must call the api to deliver or pickup data.

Pathways does not support multiple point delivery.  It was designed for a fleet of work creators to distribute work, and a fleet of work processors to compete for
those work items (i.e. first-come, first-serve) and return the .  It is therefore well-suited

## Overview
Pathways is intended for one-or-many message generators to send data lockboxes (a container with data) to one or one-of-many recipient applications.
The lockbox is pushed in a holding area assigned to the path, pending a p
