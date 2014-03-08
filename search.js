// MODEL
db = {};
db.profiles = new Meteor.Collection( 'profiles' );
db.profiles.allow( {
	update: function () {
		return true
	}
} );

// METHODS
search = {

	endpoint: 'http://s195.qa2.api.sport195.com/profiles/',
	maxCached: 10,

	query: function ( q, context, doLimit ) {
		var query = {};
		if ( q ) {
			query.display_name = {
				'$regex': '.*' + q + '.*',
				'$options': 'ig'
			};
		}
		if ( context ) {
			query.context = context;
		}
		return db.profiles.find( query, {
			limit: doLimit ? search.maxCached : undefined,
			sort: {
				display_name: 1
			}
		} );
	},

	loadFixture: function () {
		var self = this,
			i = 0;

		if ( db.profiles.find( {} ).count() === 0 ) {
			_( [ 'athletes', 'teams', 'leagues', 'clubs', 'schools' ] ).each( function ( context ) {
				HTTP.get( self.endpoint + context + '?per_page=300&page=500&mode=full',
					function ( err, result ) {
						_( result.data.data ).each( function ( profile ) {
							db.profiles.insert( profile );
						} )
					} );
			} );
		}
	},
	setSelected: function ( model ) {
		Session.set( 'currentID', model.id );
		Session.set( 'currentContext', model.context );
	},

	isCurrentlySelected: function ( model ) {
		return Session.get( 'currentID' ) === model.id && Session.get( 'currentContext' ) === model.context;
	}
};


// ROUTING
Router.configure( {} );

Router.map( function () {
	this.route( 'search', {
		path: '/:q?',
		layoutTemplate: 'search',
		template: 'search_results',
		waitOn: function () {
			return [
				this.subscribe( 'search', this.params.q || '', this.params.context ),
				this.subscribe( 'count', this.params.q || '', this.params.context )
				];
		},
		after: function () {
			var inCurrentSet,
				profiles = db.profiles.find( {} ).fetch(),
				sessionId = Session.get( 'currentID' );
			if ( profiles.length ) {
				Session.set( 'q', this.params.q );
				inCurrentSet = _( profiles ).find( function ( profile ) {
					return profile.id === sessionId;
				} );
				if ( !sessionId || !inCurrentSet ) {
					search.setSelected( _( profiles ).first() );
				}
			}
		}
	} );
} );


if ( Meteor.isClient ) {

	db.count = new Meteor.Collection( 'count' );

	Meteor.autorun( function () {
		Session.get( 'currentID' );
		$( '.overlay' ).css( {
			display: 'block',
			opacity: .75
		} );
		_.delay( function () {
			$( '.overlay' ).css( {
				display: 'none',
				opacity: 0
			} );
		}, 250 );
	} );

	Meteor.autorun( function () {
		var searchBar = $( '.search' ),
			q = Session.get( 'q' );
		if ( searchBar.val() === "" ) {
			searchBar.val( q );
		}
	} );

	Template.search_results.results = function () {
		var profiles = db.profiles.find( {} ).fetch();
		if ( profiles.length ) {
			return _( profiles ).find( function ( profile ) {
				return search.isCurrentlySelected( profile );
			} );
		}
		return {
			display_name: 'No Results'
		};
	};

	Template.main_nav.count = function () {
		var totalCount = db.count.findOne( {} ),
			localCount = db.profiles.find( {} ).count();

		if ( totalCount && localCount >= search.maxCached ) {
			return totalCount.count;
		}
		return localCount;
	};

	Template.main_nav.current = function () {
		var index = 0,
			profiles = db.profiles.find( {} ).fetch();
		_( profiles ).some( function ( profile, i ) {
			if ( search.isCurrentlySelected( profile ) ) {
				index = i + 1;
				return true;
			}
		} );
		return index;
	}

	Template.search_results.rendered = function () {
		var current = db.profiles.findOne( {
			id: Session.get( 'currentID' ),
			context: Session.get( 'currentContext' )
		} );
		$( '.results .editable' ).editable( {
			type: 'textarea'
		}, function ( evt ) {
			var setter = {},
				key = evt.target.data( 'key' );
			setter[ key ] = evt.value;
			db.profiles.update( {
				_id: current._id
			}, {
				$set: setter
			} );
		} );
	};

	Template.main_nav.events( {
		'click .down': function ( evt ) {
			var profiles = db.profiles.find( {} ).fetch();
			_( profiles ).some( function ( profile, i ) {
				if ( search.isCurrentlySelected( profile ) ) {
					if ( i < profiles.length - 1 ) {
						search.setSelected( profiles[ i + 1 ] );
					}
					return true;
				}
			} );

		},
		'click .up': function ( evt ) {
			var profiles = db.profiles.find( {} ).fetch();
			_( profiles ).some( function ( profile, i ) {
				if ( search.isCurrentlySelected( profile ) ) {
					if ( i > 0 ) {
						search.setSelected( profiles[ i - 1 ] );
					}
					return true;
				}
			} );
		}
	} );

	Template.search_bar.events( {
		'keyup .search': function ( ev ) {
			var val = $( '.search' ).val();
			Router.go( 'search', {
				q: val
			} );
		}
	} );

}

if ( Meteor.isServer ) {

	Meteor.startup( function () {

		var countId = new Meteor.Collection.ObjectID(),
			count = 0;

		// load testing data
		search.loadFixture();

		// publish search results
		Meteor.publish( 'search', function ( q, context ) {
			return search.query( q, context, true );
		} );

		Meteor.publish( 'count', function ( q, context ) {
			var self = this,
				cursor = search.query( q, context ),
				count = cursor.count(),
				initializing = true,
				handle = cursor.observeChanges( {
					added: function ( id ) {
						if ( !initializing ) {
							count++;
							self.changed( 'count', countId, {
								count: count
							} );
						}

					},
					removed: function ( id ) {
						count--;
						self.changed( 'count', countId, {
							count: count
						} );
					}
				} );

			// Observe only returns after the initial added callbacks have
			// run.  Now return an initial value and mark the subscription
			// as ready.
			initializing = false;
			self.added( 'count', countId, {
				count: count
			} );
			self.ready();

			// Stop observing the cursor when client unsubs.
			// Stopping a subscription automatically takes
			// care of sending the client any removed messages.
			self.onStop( function () {
				handle.stop();
			} );

		} );

	} );
}
