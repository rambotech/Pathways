cd $HOME/src/BOG/Pathways/server
nodejs server.js --adminAccessToken Admin --userAccessToken User --httpPortNumber 5670 --httpsPortNumber 5671 --payloadSizeLimit 550000 --pathwayMaximumPayloads 100 --totalPayloadSizeLimit 1000000000 --loggingLevel 0
