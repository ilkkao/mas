
'use strict';

const irc = require('irc'),
      utils = require('../../utils');

module.exports = {
    'Basic IRC messaging': function(browser) {
        browser
            .createUser()
            .perform(function(client, done) {
                let ircClient = new irc.Client('localhost', 'ircuser', {
                    channels: [ '#test' ]
                });

                ircClient.addListener('join#test', function() {
                    // Greet everybody who joins
                    ircClient.say('#test', 'welcome!');
                    done();
                });

                ircClient.addListener('message', function(from, to, message) {
                    // Respond pong if somebody says ping
                    if (message === 'ping') {
                        ircClient.say(to, 'pong');
                    }
                });

                ircClient.addListener('message', function(from, to, message) {
                    if (message === 'ping1on1') {
                        ircClient.say(from, 'pong1on1');
                    }
                });
            })

            // Open Join IRC channel modal
            .login('user1', '123456')
            .click('.lower-sidebar .fa-plus')
            .useXpath()
            .click('//a[contains(text(), "Join IRC channel")]')
            .useCss()

            // Join #test IRC channel
            .waitForElementVisible('.modal-dialog', 3000)
            .setValue('input#join_irc_name', '#test')
            .click('.selectize-input')
            .pause(1000)
            .click('[data-value="IRCNet"]')
            .pause(1000)
            .click('.modal-content .btn-primary')

            // Verify that the join is acknowledged by the bot
            .useXpath()
            .waitForElementVisible('//div[contains(text(), "welcome")]', 7000)
            .useCss()

            // Request pong
            .setValue('.window:not(.irc-server-window) textarea', [ 'ping', browser.Keys.ENTER ])

            // Very that bot's pong reply gets delivered
            .useXpath()
            .waitForElementVisible('//div[contains(text(), "pong")]', 7000)
            .useCss()

            // Receive msg from an another IRC user. Window not open
            .setValue('.window:not(.irc-server-window) textarea',
                [ 'ping1on1', browser.Keys.ENTER ])
            .useXpath()
            .waitForElementVisible('//div[contains(text(), "pong1on1")]', 7000)
            .useXpath()
            .end();
    },

    tearDown: utils.tearDown
};
