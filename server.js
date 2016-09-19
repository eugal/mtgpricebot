var fs 	= require('fs'),
http 	= require('http'),
Slack 	= require('slack-node'),
Client 	= require('websocket').client,
Index 	= require('node-index'),
path 	= require('path'),
express = require('express'),
request = require('request'),
cheerio = require('cheerio');

process.on('uncaughtException', function (err) {
	console.log('Uncaught exception: ', err);
});

//init slack 
var slack = new Slack("xoxb-80961693009-BTynM5wlAZh27F9Sax7aKhlU"),
client = new Client(),
index = new Index(),
userId = null;

console.log('Fetching list of card names...');
var sets = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'AllSets.json'), 'utf8'));

console.log('Indexing card names...');

for (var s in sets) {
	var set = sets[s];
	for (var c in set.cards) {

		var card = set.cards[c];
		if (card.multiverseid !== undefined){
			index.addDocument(card.id, { name: card.name, multiverseid: card.multiverseid.toString(), set: set.name });
		}
	}
}

console.log('Ready for requests...');

client.on('connectFailed', function(error) {
	console.log('error connecting', error);
});

client.on('connect', function(connection) {
	connection.on('message', function(message) {
		
		data = JSON.parse(message.utf8Data);	
		if (data.user != userId && data.type == 'message') {
			if (!data.text){
				return;
			}
			var text = data.text.replace(/(\[){2,}/, "[");
			text = text.replace(/(\]){2,}/, "]");
			var attachments = [];
			var bestMatches = [];
			var cardMatches = [];
			var totalRequests = 0;
			var cardPrice = null;
			
			for (i = text.indexOf("["); i >= 0; i = text.indexOf("[", i + 1)) {
				cardMatches.push(text.substring(i + 1, text.indexOf("]", i)));
			}
			
			if (!cardMatches.length && data.user == 'U0HP4K8D7' && text.indexOf("soup") >= 0) {
				slack.api("chat.postMessage", {channel: data.channel, as_user: true, text: ':stew:'}, function() {});
				return;
			}
			
			for (i in cardMatches){
				var indexMatches = index.query(cardMatches[i]),
				target = cardMatches[i].toLowerCase().replace(/[^ \w]/g, ' ').replace(/ +/g, ' ');
				var match = null;
				
				for (j in indexMatches) {
					
					var test = indexMatches[j].doc.name.toLowerCase().replace(/[^ \w]/g, ' ').replace(/ +/g, ' ');
					
					if (target.indexOf(test) >= 0 && (!match || indexMatches[j].doc.name.length > match.doc.name.length)) {
						match = indexMatches[j];
					}
				}
				if (match) {
					bestMatches.push(match);
				}
			}
			
			totalRequests = bestMatches.length;
			for (var i in bestMatches) {
				(function(index, channel) {
					var output = '';

					var card = bestMatches[index].doc;
					attachments.push({
						title: card.name,
						title_link: 'http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid='+card.multiverseid,
						image_url: 'http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid='+card.multiverseid+'&type=card'
					});

					totalRequests--;
					if (totalRequests <= 0){

						//make URL, remove whitespace and :, anything else might fuck up the url?
						var cardName = card.name;
						var cardSet = card.set;
						cardName = cardName.replace(/\s+/g, '-').toLowerCase();
						cardSet = cardSet.replace(/\s+/g, '-').toLowerCase();
						cardSet = cardSet.replace(/:/g, '');

						//url = 'http://shop.tcgplayer.com/magic/dragons-of-tarkir/collected-company'; //example URL
						url = 'http://shop.tcgplayer.com/magic/' + cardSet + '/' + cardName; 
						console.log(url);

						request(url, function(error, response, html){
							if(!error)  {
								var $ = cheerio.load(html);

								$('.priceGuidePricePointData').first().filter(function(){
									cardPrice = $(this).text().trim();
									console.log(cardPrice + ' ' + cardName + cardSet);
									if(!cardPrice){
										cardPrice = 'error';
									}

									var JSONattachments = JSON.stringify(attachments);
									slack.api("chat.postMessage", {channel: channel, as_user: true, text: card.set + ': ' + cardPrice, attachments: JSONattachments}, function() {});
						
								})
							}
						})	
					}
				})(i, data.channel);
			}	
		}	
	});
});

slack.api("rtm.start", function(err, response) {
	if (err){
		console.log("Error starting slack bot: ", err);
	}
	userId = response.self.id;
	client.connect(response.url);
});