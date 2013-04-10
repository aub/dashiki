Dash.namespace('Stat');

Dash.Stat = function(cfg) {
  var type = Dash.capitalize(cfg.type || 'Graphite');
  cfg.data_source = new Dash.Source[type](cfg);

  var key;
  for (key in cfg) {
    if (cfg.hasOwnProperty(key)) {
      this[key] = cfg[key];
    }
  }
  return this;
}

Dash.Stat.prototype = {

  // aggregate a series with multiple metrics into one for display on mini graph
  aggregateSeries: function(series) {
    var totals = [];
    series.forEach(function(metric) {
      metric.data.forEach(function(point, i) {
        if ( point.y === null ) { // must preserve null values and not let them get cast to zero
          (typeof totals[i] == 'undefined') && (totals[i] = null); // init total w/null
        } else {
          totals[i] = (totals[i] || 0) + point.y;
        }
      });
    });

    if ( this.aggregate == 'mean' ) {
      var len = totals.length;
      return totals.map(function(x) { return x/len });
    } else {
      return totals;
    }
  },

  // calculate stats like sum, mean, max, min
  calculateValues: function(values) {
    var sum = 0, max = 0, min = false;

    var non_null = values.filter(function(value) {
      return value !== null;
    });

    non_null.forEach(function(value) {
      sum += value;
      max  = Math.max(max, value);
      min  = min ? Math.min(min, value) : value; // handle first value
    });

    var len = non_null.length;
    return {
      sum:  sum,
      mean: sum/len,
      max:  max,
      min:  min,
      last: len == 0 ? 'no data' : non_null[len-1]
    };
  },

  // return data, passed through filter if one set
  applyFilter: function(data) {
    return this.hasOwnProperty('filter') ? this.filter(data) : data;
  },

  // call this to update a series for graphing
  update: function(from, callback) {
    var self = this;
    this.get(from).done(function(data) {
      self.updateData(self.applyFilter(data));
      callback(self);
    })
    return this;
  },

  // call this instead for discrete events
  updateEvent: function(from, callback) {
    var self = this;
    this.get(from).done(function(data) {
      self.events = self.data_source.toEvents(self.applyFilter(data));
      callback(self);
    })
    return this;
  },

  // do request for updated stat data, return the deferred ajax object
  get: function(from) {
    var url = this.data_source.url(from);

    // source url() function can return just a url string to GET, or entire http request object
    var request = (typeof url === "string") ?
      {
        type:     'GET',
        url:      this.data_source.url(from),
        dataType: 'json',
        headers:  this.headers || {},
        error:   function(xhr, type, err) { console.log(type + ': ' + err); }
      } : url;

    return Dash.ajax(request, this.proxy);
  },

  // process data into series and calculate all display stats
  updateData: function(data) {
    this.series = this.data_source.toSeries(data);      // convert to a series
    this.aggregate = this.aggregateSeries(this.series); // series sum/mean across all metrics
    this.stats = this.calculateValues(this.aggregate);  // {sum, mean, max, min} for display

    var raw_value  = this.stats[this.display || 'sum']; // raw display value
    this.classes = [].concat(this.matchingThresholds(raw_value)); // css classes to apply
    this.value = this.format(raw_value); // formatted display value with units
    return this;
  },

  displaySymbols: {
    sum:  '&Sigma;',
    mean: '&mu;',
    max:  '&uarr;',
    min:  '&darr;',
    last: '&rarr;'
  },

  displaySymbol: function() {
    return this.displaySymbols[this.display];
  },

  // return array of classes from threshold which match
  matchingThresholds: function(value) {
    var classes = (this.thresholds || []).filter(function(threshold) {
      return threshold.test(value);
    }).map(function(threshold) {
      return threshold.class.split(/[\s,]+/);
    });

    return Array.prototype.concat.apply([], classes); // flatten array
  }

};
