"use strict";

var _ = require('underscore');
var async = require('async');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var FeedParser = require('feedparser');
var request = require('request');

var onError = function (error) {
  console.error('Error: ' + error);
};

var Datastore = require('nedb');

var db = {};
db.sites = new Datastore();
db.feeds = new Datastore();

var sites = [
  { title: 'Wykop.pl', url: 'http://www.wykop.pl/rss' },
  { title: 'Antyweb.pl', url : 'http://feeds2.feedburner.com/Antyweb' }
]

var saveFeedData = function(feed) {
  db.feeds.find({ guid: feed.guid, site_id: feed.site_id }, function (err, feeds) {
    if (feeds.length == 0)
    {
      db.feeds.insert(feed, function (err, feed) {
        if (err)
        {
          console.log('Error occured during feed save');
        }
      });
    }
  });
}

var getFeedData = function (site) {
  console.log('Fetching feeds for: ' + site.url);

  try {
    request(site.url)
      .pipe(new FeedParser())
      .on('error', onError)
      .on('readable', function() {
        var stream = this, item;
        var add_feed = false;

        while (item = stream.read()) {
          item.site_id = site._id;
          item.seen = false;

          saveFeedData(item);
        }
      });
  } catch(e) {
    console.log('Error occured during fetching feed: ' + e);
  }
}

var initSampleSites = function(site) {
  db.sites.insert(site, function (err, site) {
    if (err) {
      console.log('Error occured during site save');
    }
  });
}

var getFeeds = function () {
  db.sites.find({}, function (err, sites) {
    if (err) {
      console.log('Error occured during fetching site list');
    } else {
      sites.forEach(getFeedData);
    }
  });
}

sites.forEach(initSampleSites);
setInterval(getFeeds, 1000 * 10);

app.use(express.static('public'));
app.use(bodyParser.json());

app.get('/sites', function (req, res) {
  var fetchSites = function(callback) {
    db.sites.find({}, callback);
  };

  var fetchSitesCount = function(sites, callback) {
    var funcs = _.map(sites, function(site) {
      return function(cb) {
        db.feeds.count({ seen: false, site_id: site._id }, function (err, count) {
          site.count = count;
          cb(err);
        });
      }
    });

    async.parallel(funcs, function(err){
      callback(err, sites);
    });
  };

  async.waterfall([
    fetchSites.bind(this),
    fetchSitesCount.bind(this)
  ], function(err, result){
    if (err) {
      res.send({ error: err });
    } else {
      res.send({ data: result });
    }
  })
});

app.post('/sites', function (req, res) {
  db.sites.insert(req.body, function (err, site) {
    if (err) {
      res.send({ error: err });
    } else {
      res.send({ data: req.body });
    }
  });
});

app.get('/feeds', function (req, res) {
  db.feeds.find({ seen: false }, function (err, docs) {
    if (err) {
      res.send({ error: err });
    } else {
      res.send({ data: docs });
    }
  });
});

app.get('/feeds/:category_id', function (req, res) {
  db.feeds.find({ seen: false, site_id: req.params.category_id }, function (err, docs) {
    if (err) {
      res.send({ error: err });
    } else {
      res.send({ data: docs });
    }
  });
});

app.post('/feeds/:category_id?', function (req, res) {
  db.feeds.update({ _id: req.body._id }, { $set: { seen: true } }, {}, function (err, numReplaced) {
    if (err) {
      res.send({ error: err });
    } else {
      res.send({ data: req.body });
    }
  });
});

var server = app.listen(8080, function () {
  var port = server.address().port;
  console.log('App listening at http://localhost:%s', port);
});