// MODEL
db = {};
db.profiles = new Meteor.Collection( 'profiles' );
db.profiles.allow( {
	update: function ( ) {
		return true;
	}
} );

// METHODS
search = {

	endpoint: 'http://s195.qa1.mobile.sport195.com/api/service/-/profiles/',
	perPage: 1,
	page: 1,

	// perform regex query of profile using `q`,
	// optionally limiting by `context`
	query: function ( q, context ) {
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
			sort: {
				display_name: 1
			}
		} );
	},

	loadFixture: function ( ) {
		var self = this,
			i = 0;

		if ( db.profiles.find( {} ).count( ) === 0 ) {
			_( [ 'athletes', 'teams' ] ).each( function ( context ) {
				HTTP.get( self.endpoint + context + '?per_page=100&page=5&mode=basic', function ( err, result ) {
					_( result.data.data ).each( function ( profile ) {
						db.profiles.insert( profile );
					} );
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


// Set up router to subscribe to profiles that match the query param
// and context
Router.map( function ( ) {
	this.route( 'search', {
		path: '/:q?',
		layoutTemplate: 'search',
		template: 'search_results',
		waitOn: function ( ) {
			return this.subscribe( 'search', this.params.q || '', this.params.context );
		},
		after: function ( ) {
			// after route change make sure the active element
			// hasn't been removed from the set. Sets first element
			// in the set if it has been cleared
			var inCurrentSet,
				profiles = db.profiles.find( {} ).fetch( ),
				sessionId = Session.get( 'currentID' );

			if ( profiles.length ) {

				Session.set( 'q', this.params.q );
				inCurrentSet = _( profiles ).find( function ( profile ) {
					return profile.id === sessionId;
				} );

				if ( !sessionId || !inCurrentSet ) {
					search.setSelected( _( profiles ).first( ) );
				}
			}
		}
	} );
} );


if ( Meteor.isClient ) {

	// fade in - out on the overlay whenever
	// the active profile changes
	Meteor.autorun( function ( ) {
		Session.get( 'currentID' );
		$( '.overlay' ).css( {
			display: 'block',
			opacity: 0.75
		} );
		_.delay( function ( ) {
			$( '.overlay' ).css( {
				display: 'none',
				opacity: 0
			} );
		}, 250 );
	} );

	// set value of search bar on query change
	Meteor.autorun( function ( ) {
		var searchBar = $( '.search' ),
			q = Session.get( 'q' );
		if ( searchBar.val( ) === "" ) {
			searchBar.val( q );
		}
	} );

	// observe profile changes, setting the current profile
	// on any insertions
	Meteor.autorun( function ( ) {
		var profiles = db.profiles.find( {} );
		profiles.observeChanges( {
			added: function ( id, fields ) {
				console.log( id );
				console.log( fields );
				Session.set( 'currentID', id );
				Session.set( 'currentContext', fields.context );
			}
		} )
	} );

	// Render the active profile
	Template.search_results.results = function ( ) {
		var profiles = db.profiles.find( {} ).fetch( );
		if ( profiles.length ) {
			return _( profiles ).find( function ( profile ) {
				return search.isCurrentlySelected( profile );
			} );
		}
		return {
			display_name: 'No Results'
		};
	};

	// Render the length of the filtered collection
	Template.main_nav.count = function ( ) {
		return db.profiles.find( {} ).count( );
	};

	// Render the current index of the active profile
	Template.main_nav.current = function ( ) {
		var index = 0,
			profiles = db.profiles.find( {} ).fetch( );

		_( profiles ).some( function ( profile, i ) {
			if ( search.isCurrentlySelected( profile ) ) {
				index = i + 1;
				return true;
			}
		} );
		return index;
	};

	// Register editable plugin and react to change by updating
	// the key data in Mongo
	Template.search_results.rendered = function ( ) {
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
			// increment the active profile, wrapping to
			// first item if at the end
			var profiles = db.profiles.find( {} ).fetch( );

			_( profiles ).some( function ( profile, i ) {
				if ( search.isCurrentlySelected( profile ) ) {
					if ( i < profiles.length - 1 ) {
						search.setSelected( profiles[ i + 1 ] );
					} else {
						search.setSelected( _( profiles ).first( ) );
					}
					return true;
				}
			} );

		},
		'click .up': function ( evt ) {
			// decrement the active profile, wrapping to
			// the last item if at the beginning
			var profiles = db.profiles.find( {} ).fetch( );
			_( profiles ).some( function ( profile, i ) {
				if ( search.isCurrentlySelected( profile ) ) {
					if ( i > 0 ) {
						search.setSelected( profiles[ i - 1 ] );
					} else {
						search.setSelected( _( profiles ).last( ) );
					}
					return true;
				}
			} );
		}
	} );

	Template.search_bar.events( {
		// update route query on search change
		'keyup .search': function ( ev ) {
			var val = $( '.search' ).val( );
			Router.go( 'search', {
				q: val
			} );
		}
	} );

}

if ( Meteor.isServer ) {

	Meteor.startup( function ( ) {

		Facts.setUserIdFilter( function ( ) {
			return true;
		} );

		// Uncomment to load an initial dataset
		search.loadFixture( );

		// publish search results
		Meteor.publish( 'search', function ( q, context ) {
			return search.query( q, context );
		} );

	} );
}
