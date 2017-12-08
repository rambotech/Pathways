# Start four background instances of Pathways server on 5670/71, 72/73, 74/75, 76/77.
# Adjust the adminAccessToken and userAccessToken values in the config file for security.
# Each server should have the same values if they are handling the same application traffic.

# 

cd server

nodejs server/server.js --settingsFile server/test.config 
--httpPortNumber 5670 --httpsPortNumber 5671 --loggingLevel 0 > $HOME/pathways-srv1.txt &

nodejs server/server.js --settingsFile server/test.config \
--httpPortNumber 5672 --httpsPortNumber 5673 --loggingLevel 0 > $HOME/pathways-srv2.txt &

nodejs server/server.js --settingsFile server/test.config \
--httpPortNumber 5674 --httpsPortNumber 5675 --loggingLevel 0 > $HOME/pathways-srv3.txt &

nodejs server/server.js --settingsFile server/test.config \
--httpPortNumber 5676 --httpsPortNumber 5677 --loggingLevel 0 > $HOME/pathways-srv4.txt &

cd ..
