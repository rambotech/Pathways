# Start four background instances of Pathways server on 5670/71, 72/73, 74/75, 76/77.
# Adjust the adminAccessToken and userAccessToken values for security, but ensure each server
# has the same values if they are handling the same application traffic.

nodejs server.js --httpPortNumber 5670 --httpsPortNumber 5671 --ipWhitelist 107.188.190.165 --adminAccessToken Admin --userAccessToken User --payloadSizeLimit 500000 --pathwayMaximumPayloads 50 --pathwayCountLimit 20 --loggingLevel 0 > $HOME/pathways-srv1.txt &

nodejs server.js --httpPortNumber 5672 --httpsPortNumber 5673 --ipWhitelist 107.188.190.165 --adminAccessToken Admin --userAccessToken User --payloadSizeLimit 500000 --pathwayMaximumPayloads 50 --pathwayCountLimit 20 --loggingLevel 0 > $HOME/pathways-srv2.txt &

nodejs server.js --httpPortNumber 5674 --httpsPortNumber 5675 --ipWhitelist 107.188.190.165 --adminAccessToken Admin --userAccessToken User --payloadSizeLimit 500000 --pathwayMaximumPayloads 50 --pathwayCountLimit 20 --loggingLevel 0 > $HOME/pathways-srv3.txt &

nodejs server.js --httpPortNumber 5676 --httpsPortNumber 5677 --ipWhitelist 107.188.190.165 --adminAccessToken Admin --userAccessToken User --payloadSizeLimit 500000 --pathwayMaximumPayloads 50 --pathwayCountLimit 20 --loggingLevel 0 > $HOME/pathways-srv4.txt &
