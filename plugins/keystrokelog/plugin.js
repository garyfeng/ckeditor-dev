/**
 * @license Copyright (c) Gary Feng, 2015
 * based on the Undo/Redo code by Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

/**
 * @fileOverview Keystroke logging plug-in.
 */


'use strict';

( function() {
	// garyfeng: TODO: need to assign other hotkeys.
	var keystrokes = [
			CKEDITOR.CTRL + 90 /*Z*/,
			CKEDITOR.CTRL + 89 /*Y*/,
			CKEDITOR.CTRL + CKEDITOR.SHIFT + 90 /*Z*/
		],
		backspaceOrDelete = { 8: 1, 46: 1 };

	CKEDITOR.plugins.add( 'keystrokelog', {
		// jscs:disable maximumLineLength
		lang: 'af,ar,bg,bn,bs,ca,cs,cy,da,de,el,en,en-au,en-ca,en-gb,eo,es,et,eu,fa,fi,fo,fr,fr-ca,gl,gu,he,hi,hr,hu,id,is,it,ja,ka,km,ko,ku,lt,lv,mk,mn,ms,nb,nl,no,pl,pt,pt-br,ro,ru,si,sk,sl,sq,sr,sr-latn,sv,th,tr,tt,ug,uk,vi,zh,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		// garyfeng: TODO: need to replace the icons
		icons: 'redo,redo-rtl,undo,undo-rtl', // %REMOVE_LINE_CORE%
		hidpi: true, // %REMOVE_LINE_CORE%

		init: function( editor ) {
			var keystrokeManager = editor.keystrokeManager = new KeystrokeManager( editor ),
				editingHandler = keystrokeManager.editingHandler = new NativeEditingHandler( keystrokeManager );

			// garyfeng: not sure this is necessary
			var KeystrokeStartCommand = editor.addCommand( 'keystrokeStart', {
				exec: function() {
					if ( keystrokeManager.keystrokeStart() ) {
						editor.selectionChange();
						this.fire( 'afterKeystrokeStart' );
					}
				},
				startDisabled: true,
				canUndo: false
			} );

			var KeystrokeStopCommand = editor.addCommand( 'keystokeStop', {
				exec: function() {
					if ( keystrokeManager.keystokeStop() ) {
						editor.selectionChange();
						this.fire( 'afterKeytrokeStop' );
					}
				},
				startDisabled: true,
				canUndo: false
			} );

			// garyfeng: TODO: need to replace the hot keys
			editor.setKeystroke( [
				[ keystrokes[ 0 ], 'keystrokeStart' ],
				[ keystrokes[ 1 ], 'keystokeStop' ],
				[ keystrokes[ 2 ], 'keystokeStop' ]
			] );

			// garyfeng: TODO: need this?
			keystrokeManager.onChange = function() {
				KeystrokeStartCommand.setState( keystrokeManager.undoable() ? CKEDITOR.TRISTATE_OFF : CKEDITOR.TRISTATE_DISABLED );
				KeystrokeStopCommand.setState( keystrokeManager.redoable() ? CKEDITOR.TRISTATE_OFF : CKEDITOR.TRISTATE_DISABLED );
			};

			// garyfeng: This is the primary saveSnapShot function.
			// need to convert the save() function to the log() function.
			function recordCommand( event ) {
				// If the command hasn't been marked to not support undo.
				if ( keystrokeManager.enabled && event.data.command.canUndo !== false )
					keystrokeManager.save();
			}

			// We'll save snapshots before and after executing a command.
			editor.on( 'beforeCommandExec', recordCommand );
			editor.on( 'afterCommandExec', recordCommand );

			// Save snapshots before doing custom changes.
			editor.on( 'saveSnapshot', function( evt ) {
				keystrokeManager.save( evt.data && evt.data.contentOnly );
			} );

			// garyfeng: not sure what this does.
			// Event manager listeners should be attached on contentDom.
			editor.on( 'contentDom', editingHandler.attachListeners, editingHandler );

			editor.on( 'instanceReady', function() {
				// Saves initial snapshot.
				editor.fire( 'saveSnapshot' );
			} );

			// Always save an undo snapshot - the previous mode might have
			// changed editor contents.
			editor.on( 'beforeModeUnload', function() {
				editor.mode == 'wysiwyg' && keystrokeManager.save( true );
			} );

			//garyfeng: TODO: this probalby is unnecessary
			function toggleKeystrokeManager() {
				keystrokeManager.enabled = editor.readOnly ? false : editor.mode == 'wysiwyg';
				keystrokeManager.onChange();
			}

			//garyfeng: TODO: this probalby is unnecessary
			// Make the undo manager available only in wysiwyg mode.
			editor.on( 'mode', toggleKeystrokeManager );

			//garyfeng: TODO: this probalby is unnecessary
			// Disable undo manager when in read-only mode.
			editor.on( 'readOnly', toggleKeystrokeManager );

			if ( editor.ui.addButton ) {
				editor.ui.addButton( 'KeystrokeStart', {
					label: editor.lang.undo.undo,
					command: 'keystrokeStart',
					toolbar: 'undo,10'
				} );

				editor.ui.addButton( 'KeystrokeStop', {
					label: editor.lang.undo.redo,
					command: 'keystrokeStop',
					toolbar: 'undo,20'
				} );
			}

			/**
			 * Resets the undo stack.
			 *
			 * @member CKEDITOR.editor
			 */
			editor.resetUndo = function() {
				// Reset the undo stack.
				keystrokeManager.reset();

				// Create the first image.
				editor.fire( 'saveSnapshot' );
			};

			/**
			 * Amends the top of the undo stack (last undo image) with the current DOM changes.
			 *
			 *		function() {
			 *			editor.fire( 'saveSnapshot' );
			 *			editor.document.body.append(...);
			 *			// Makes new changes following the last undo snapshot a part of it.
			 *			editor.fire( 'updateSnapshot' );
			 *			..
			 *		}
			 *
			 * @event updateSnapshot
			 * @member CKEDITOR.editor
			 * @param {CKEDITOR.editor} editor This editor instance.
			 */
			editor.on( 'updateSnapshot', function() {
				if ( keystrokeManager.currentImage )
					keystrokeManager.update();
			} );

			/**
			 * Locks the undo manager to prevent any save/update operations.
			 *
			 * It is convenient to lock the undo manager before performing DOM operations
			 * that should not be recored (e.g. auto paragraphing).
			 *
			 * See {@link CKEDITOR.plugins.keystrokelog.KeystrokeManager#lock} for more details.
			 *
			 * **Note:** In order to unlock the undo manager, {@link #unlockSnapshot} has to be fired
			 * the same number of times that `lockSnapshot` has been fired.
			 *
			 * @since 4.0
			 * @event lockSnapshot
			 * @member CKEDITOR.editor
			 * @param {CKEDITOR.editor} editor This editor instance.
			 * @param data
			 * @param {Boolean} [data.dontUpdate] When set to `true`, the last snapshot will not be updated
			 * with the current content and selection. Read more in the {@link CKEDITOR.plugins.keystrokelog.KeystrokeManager#lock} method.
			 * @param {Boolean} [data.forceUpdate] When set to `true`, the last snapshot will always be updated
			 * with the current content and selection. Read more in the {@link CKEDITOR.plugins.keystrokelog.KeystrokeManager#lock} method.
			 */
			editor.on( 'lockSnapshot', function( evt ) {
				var data = evt.data;
				keystrokeManager.lock( data && data.dontUpdate, data && data.forceUpdate );
			} );

			/**
			 * Unlocks the undo manager and updates the latest snapshot.
			 *
			 * @since 4.0
			 * @event unlockSnapshot
			 * @member CKEDITOR.editor
			 * @param {CKEDITOR.editor} editor This editor instance.
			 */
			editor.on( 'unlockSnapshot', keystrokeManager.unlock, keystrokeManager );
		}
	} );

	CKEDITOR.plugins.keystrokelog = {};

	/**
	 * Main logic for the keystroke log functions.
	 *
	 * @private
	 * @class CKEDITOR.plugins.keystrokelog.KeystrokeManager
	 * @constructor Creates an KeystrokeManager class instance.
	 * @param {CKEDITOR.editor} editor
	 */
	var KeystrokeManager = CKEDITOR.plugins.keystrokelog.KeystrokeManager = function( editor ) {
		/**
		 * An array storing the number of key presses, count in a row. Use {@link #keyGroups} members as index.
		 *
		 * **Note:** The keystroke count will be reset after reaching the limit of characters per snapshot.
		 *
		 * @since 4.4.4
		 */
		this.strokesRecorded = [ 0, 0 ];

		/**
		 * When the `locked` property is not `null`, the undo manager is locked, so
		 * operations like `save` or `update` are forbidden.
		 *
		 * The manager can be locked and unlocked by the {@link #lock} and {@link #unlock}
		 * methods, respectively.
		 *
		 * @readonly
		 * @property {Object} [locked=null]
		 */
		this.locked = null;

		/**
		 * Contains the previously processed key group, based on {@link #keyGroups}.
		 * `-1` means an unknown group.
		 *
		 * @since 4.4.4
		 * @readonly
		 * @property {Number} [previousKeyGroup=-1]
		 */
		this.previousKeyGroup = -1;

		/**
		 * The maximum number of snapshots in the stack. Configurable via {@link CKEDITOR.config#undoStackSize}.
		 *
		 * @readonly
		 * @property {Number} [limit]
		 */
		this.limit = editor.config.undoStackSize || 20;

		/**
		 * The maximum number of characters typed/deleted in one undo step.
		 *
		 * @since 4.4.5
		 * @readonly
		 */
		// garyfeng: change this from 25 to 2.
		this.strokesLimit = 2;

		this.editor = editor;

		// Reset the undo stack.
		this.reset();
	};

	KeystrokeManager.prototype = {
		/**
		 * Handles logging of content changes.
		 * 	garyfeng: v01. Simply console.log()
		 *
		 * @param {Number} keyCode The key code.
		 * @param {Boolean} [strokesPerSnapshotExceeded] When set to `true`, the method will
		 * behave as if the strokes limit was exceeded regardless of the {@link #strokesRecorded} value.
		 */
		logit: function( msg, obj ) {
			// garyfeng: v1.
			console.log("logit: "+msg+"\t"+JSON.stringify(obj))
		},
			/**
			 * Handles keystroke support for the undo manager. It is called on `keyup` event for
			 * keystrokes that can change the editor content.
			 *
			 * @param {Number} keyCode The key code.
			 * @param {Boolean} [strokesPerSnapshotExceeded] When set to `true`, the method will
			 * behave as if the strokes limit was exceeded regardless of the {@link #strokesRecorded} value.
			 */
		type: function( keyCode, strokesPerSnapshotExceeded ) {
				// garyfeng: either FUNCTIONAL or PRINTABLE
			var keyGroup = KeystrokeManager.getKeyGroup( keyCode ),
				// Count of keystrokes in current a row.
				// Note if strokesPerSnapshotExceeded will be exceeded, it'll be restarted.
				strokesRecorded = this.strokesRecorded[ keyGroup ] + 1;

			strokesPerSnapshotExceeded =
				( strokesPerSnapshotExceeded || strokesRecorded >= this.strokesLimit );

			if ( !this.typing )
				onTypingStart( this );

			//garyfeng:  a 'change' or 'saveSnapshot' event will be fired at keyup
			if ( strokesPerSnapshotExceeded ) {
				// Reset the count of strokes, so it'll be later assigned to this.strokesRecorded.
				strokesRecorded = 0;

				this.editor.fire( 'saveSnapshot' );
			} else {
				// Fire change event.
				this.editor.fire( 'change' );
			}

			// garyfeng:
			this.logit("TYPE", {"t":(new Date()).getTime(), "keycode":keyCode, "keyGroup":keyGroup})

			// Store recorded strokes count.
			this.strokesRecorded[ keyGroup ] = strokesRecorded;
			// This prop will tell in next itaration what kind of group was processed previously.
			this.previousKeyGroup = keyGroup;
		},

		/**
		 * Whether the new `keyCode` belongs to a different group than the previous one ({@link #previousKeyGroup}).
		 *
		 * @since 4.4.5
		 * @param {Number} keyCode
		 * @returns {Boolean}
		 */
		keyGroupChanged: function( keyCode ) {
			return KeystrokeManager.getKeyGroup( keyCode ) != this.previousKeyGroup;
		},

		/**
		 * Resets the undo stack.
		 */
		reset: function() {
			// Stack for all the undo and redo snapshots, they're always created/removed
			// in consistency.
			this.snapshots = [];

			// Current snapshot history index.
			this.index = -1;

			this.currentImage = null;

			this.hasUndo = false;
			this.hasRedo = false;
			this.locked = null;

			this.resetType();
		},

		/**
		 * Resets all typing variables.
		 *
		 * @see #type
		 */
		resetType: function() {
			this.strokesRecorded = [ 0, 0 ];
			this.typing = false;
			this.previousKeyGroup = -1;
		},

		/**
		 * Refreshes the state of the {@link CKEDITOR.plugins.keystrokelog.KeystrokeManager undo manager}
		 * as well as the state of the `undo` and `redo` commands.
		 */
		refreshState: function() {
			// These lines can be handled within onChange() too.
			this.hasUndo = !!this.getNextImage( true );
			this.hasRedo = !!this.getNextImage( false );
			// Reset typing
			this.resetType();
			this.onChange();
		},

		/**
		 * Saves a snapshot of the document image for later retrieval.
		 *
		 * @param {Boolean} onContentOnly If set to `true`, the snapshot will be saved only if the content has changed.
		 * @param {CKEDITOR.plugins.keystrokelog.Image} image An optional image to save. If skipped, current editor will be used.
		 * @param {Boolean} [autoFireChange=true] If set to `false`, will not trigger the {@link CKEDITOR.editor#change} event to editor.
		 */
		save: function( onContentOnly, image, autoFireChange ) {
			var editor = this.editor;
			// Do not change snapshots stack when locked, editor is not ready,
			// editable is not ready or when editor is in mode difference than 'wysiwyg'.
			if ( this.locked || editor.status != 'ready' || editor.mode != 'wysiwyg' )
				return false;

			var editable = editor.editable();
			if ( !editable || editable.status != 'ready' )
				return false;

			var snapshots = this.snapshots;

			// Get a content image.
			if ( !image )
				image = new Image( editor );

			// Do nothing if it was not possible to retrieve an image.
			if ( image.contents === false )
				return false;

			// Check if this is a duplicate. In such case, do nothing.
			if ( this.currentImage ) {
				if ( image.equalsContent( this.currentImage ) ) {
					if ( onContentOnly )
						return false;

					if ( image.equalsSelection( this.currentImage ) )
						return false;
				} else if ( autoFireChange !== false ) {
					editor.fire( 'change' );
				}
			}

			// Drop future snapshots.
			snapshots.splice( this.index + 1, snapshots.length - this.index - 1 );

			// If we have reached the limit, remove the oldest one.
			if ( snapshots.length == this.limit )
				snapshots.shift();

			// Add the new image, updating the current index.
			this.index = snapshots.push( image ) - 1;

			this.currentImage = image;

			if ( autoFireChange !== false )
				this.refreshState();

			// garyfeng: logging the save command
			this.logit("SAVE", image);

			return true;
		},

		/**
		 * Sets editor content/selection to the one stored in `image`.
		 *
		 * @param {CKEDITOR.plugins.keystrokelog.Image} image
		 */
		restoreImage: function( image ) {
			// Bring editor focused to restore selection.
			var editor = this.editor,
				sel;

			if ( image.bookmarks ) {
				editor.focus();
				// Retrieve the selection beforehand. (#8324)
				sel = editor.getSelection();
			}

			// Start transaction - do not allow any mutations to the
			// snapshots stack done when selecting bookmarks (much probably
			// by selectionChange listener).
			this.locked = { level: 999 };

			this.editor.loadSnapshot( image.contents );

			if ( image.bookmarks )
				sel.selectBookmarks( image.bookmarks );
			else if ( CKEDITOR.env.ie ) {
				// IE BUG: If I don't set the selection to *somewhere* after setting
				// document contents, then IE would create an empty paragraph at the bottom
				// the next time the document is modified.
				var $range = this.editor.document.getBody().$.createTextRange();
				$range.collapse( true );
				$range.select();
			}

			this.locked = null;

			this.index = image.index;
			this.currentImage = this.snapshots[ this.index ];

			// Update current image with the actual editor
			// content, since actualy content may differ from
			// the original snapshot due to dom change. (#4622)
			this.update();
			this.refreshState();

			// garyfeng: log it
			this.logit("RESTOREIMAGE", this.currentImage);
			// end garyfeng

			editor.fire( 'change' );
		},

		/**
		 * Gets the closest available image.
		 *
		 * @param {Boolean} isUndo If `true`, it will return the previous image.
		 * @returns {CKEDITOR.plugins.keystrokelog.Image} Next image or `null`.
		 */
		getNextImage: function( isUndo ) {
			var snapshots = this.snapshots,
				currentImage = this.currentImage,
				image, i;

			// garyfeng: log it
			this.logit("GETNEXTIMAGE", {});
			// end garyfeng

			if ( currentImage ) {
				if ( isUndo ) {
					for ( i = this.index - 1; i >= 0; i-- ) {
						image = snapshots[ i ];
						if ( !currentImage.equalsContent( image ) ) {
							image.index = i;
							return image;
						}
					}
				} else {
					for ( i = this.index + 1; i < snapshots.length; i++ ) {
						image = snapshots[ i ];
						if ( !currentImage.equalsContent( image ) ) {
							image.index = i;
							return image;
						}
					}
				}
			}


			return null;
		},

		/**
		 * Checks the current redo state.
		 *
		 * @returns {Boolean} Whether the document has a previous state to retrieve.
		 */
		redoable: function() {
			return this.enabled && this.hasRedo;
		},

		/**
		 * Checks the current undo state.
		 *
		 * @returns {Boolean} Whether the document has a future state to restore.
		 */
		undoable: function() {
			return this.enabled && this.hasUndo;
		},

		/**
		 * Performs an undo operation on current index.
		 */
		undo: function() {
			// garyfeng: log it
			this.logit("UNDO", {});
			// end garyfeng
			if ( this.undoable() ) {
				this.save( true );

				var image = this.getNextImage( true );
				if ( image )
					return this.restoreImage( image ), true;
			}

			return false;
		},

		/**
		 * Performs a redo operation on current index.
		 */
		redo: function() {
			// garyfeng: log it
			this.logit("REDO", {});
			// end garyfeng

			if ( this.redoable() ) {
				// Try to save. If no changes have been made, the redo stack
				// will not change, so it will still be redoable.
				this.save( true );

				// If instead we had changes, we can't redo anymore.
				if ( this.redoable() ) {
					var image = this.getNextImage( false );
					if ( image )
						return this.restoreImage( image ), true;
				}
			}

			return false;
		},

		/**
		 * Updates the last snapshot of the undo stack with the current editor content.
		 *
		 * @param {CKEDITOR.plugins.keystrokelog.Image} [newImage] The image which will replace the current one.
		 * If it is not set, it defaults to the image taken from the editor.
		 */
		update: function( newImage ) {
			// garyfeng: log it
			this.logit("UPDATE", newImage);
			// end garyfeng

			// Do not change snapshots stack is locked.
			if ( this.locked )
				return;

			if ( !newImage )
				newImage = new Image( this.editor );

			var i = this.index,
				snapshots = this.snapshots;

			// Find all previous snapshots made for the same content (which differ
			// only by selection) and replace all of them with the current image.
			while ( i > 0 && this.currentImage.equalsContent( snapshots[ i - 1 ] ) )
				i -= 1;

			snapshots.splice( i, this.index - i + 1, newImage );
			this.index = i;
			this.currentImage = newImage;
		},

		/**
		 * Amends the last snapshot and changes its selection (only in case when content
		 * is equal between these two).
		 *
		 * @since 4.4.4
		 * @param {CKEDITOR.plugins.keystrokelog.Image} newSnapshot New snapshot with new selection.
		 * @returns {Boolean} Returns `true` if selection was amended.
		 */
		updateSelection: function( newSnapshot ) {
			// garyfeng: log it
			this.logit("UPDATESELECTION", newSnapshot);
			// end garyfeng

			if ( !this.snapshots.length )
				return false;

			var snapshots = this.snapshots,
				lastImage = snapshots[ snapshots.length - 1 ];

			if ( lastImage.equalsContent( newSnapshot ) ) {
				if ( !lastImage.equalsSelection( newSnapshot ) ) {
					snapshots[ snapshots.length - 1 ] = newSnapshot;
					this.currentImage = newSnapshot;
					return true;
				}
			}

			return false;
		},

		/**
		 * Locks the snapshot stack to prevent any save/update operations and when necessary,
		 * updates the tip of the snapshot stack with the DOM changes introduced during the
		 * locked period, after the {@link #unlock} method is called.
		 *
		 * It is mainly used to ensure any DOM operations that should not be recorded
		 * (e.g. auto paragraphing) are not added to the stack.
		 *
		 * **Note:** For every `lock` call you must call {@link #unlock} once to unlock the undo manager.
		 *
		 * @since 4.0
		 * @param {Boolean} [dontUpdate] When set to `true`, the last snapshot will not be updated
		 * with current content and selection. By default, if undo manager was up to date when the lock started,
		 * the last snapshot will be updated to the current state when unlocking. This means that all changes
		 * done during the lock will be merged into the previous snapshot or the next one. Use this option to gain
		 * more control over this behavior. For example, it is possible to group changes done during the lock into
		 * a separate snapshot.
		 * @param {Boolean} [forceUpdate] When set to `true`, the last snapshot will always be updated with the
		 * current content and selection regardless of the current state of the undo manager.
		 * When not set, the last snapshot will be updated only if the undo manager was up to date when locking.
		 * Additionally, this option makes it possible to lock the snapshot when the editor is not in the `wysiwyg` mode,
		 * because when it is passed, the snapshots will not need to be compared.
		 */
		lock: function( dontUpdate, forceUpdate ) {
			// garyfeng: log it
			this.logit("LOCK", {});
			// end garyfeng

			if ( !this.locked ) {
				if ( dontUpdate )
					this.locked = { level: 1 };
				else {
					var update = null;

					if ( forceUpdate )
						update = true;
					else {
						// Make a contents image. Don't include bookmarks, because:
						// * we don't compare them,
						// * there's a chance that DOM has been changed since
						// locked (e.g. fake) selection was made, so createBookmark2 could fail.
						// http://dev.ckeditor.com/ticket/11027#comment:3
						var imageBefore = new Image( this.editor, true );

						// If current editor content matches the tip of snapshot stack,
						// the stack tip must be updated by unlock, to include any changes made
						// during this period.
						if ( this.currentImage && this.currentImage.equalsContent( imageBefore ) )
							update = imageBefore;
					}

					this.locked = { update: update, level: 1 };
				}

			// Increase the level of lock.
			} else {
				this.locked.level++;
			}
		},

		/**
		 * Unlocks the snapshot stack and checks to amend the last snapshot.
		 *
		 * See {@link #lock} for more details.
		 *
		 * @since 4.0
		 */
		unlock: function() {
			// garyfeng: log it
			this.logit("UNLOCK", {});
			// end garyfeng

			if ( this.locked ) {
				// Decrease level of lock and check if equals 0, what means that undoM is completely unlocked.
				if ( !--this.locked.level ) {
					var update = this.locked.update;

					this.locked = null;

					// forceUpdate was passed to lock().
					if ( update === true )
						this.update();
					// update is instance of Image.
					else if ( update ) {
						var newImage = new Image( this.editor, true );

						if ( !update.equalsContent( newImage ) )
							this.update();
					}
				}
			}
		}
	};

	/**
	 * Codes for navigation keys like *Arrows*, *Page Up/Down*, etc.
	 * Used by the {@link #isNavigationKey} method.
	 *
	 * @since 4.4.5
	 * @readonly
	 * @static
	 */
	KeystrokeManager.navigationKeyCodes = {
		37: 1, 38: 1, 39: 1, 40: 1, // Arrows.
		36: 1, 35: 1, // Home, End.
		33: 1, 34: 1 // PgUp, PgDn.
	};

	/**
	 * Key groups identifier mapping. Used for accessing members in
	 * {@link #strokesRecorded}.
	 *
	 * * `FUNCTIONAL` &ndash; identifier for the *Backspace* / *Delete* key.
	 * * `PRINTABLE` &ndash; identifier for printable keys.
	 *
	 * Example usage:
	 *
	 *		keystrokeManager.strokesRecorded[ keystrokeManager.keyGroups.FUNCTIONAL ];
	 *
	 * @since 4.4.5
	 * @readonly
	 * @static
	 */
	KeystrokeManager.keyGroups = {
		PRINTABLE: 0,
		FUNCTIONAL: 1
	};

	/**
	 * Checks whether a key is one of navigation keys (*Arrows*, *Page Up/Down*, etc.).
	 * See also the {@link #navigationKeyCodes} property.
	 *
	 * @since 4.4.5
	 * @static
	 * @param {Number} keyCode
	 * @returns {Boolean}
	 */
	KeystrokeManager.isNavigationKey = function( keyCode ) {
		return !!KeystrokeManager.navigationKeyCodes[ keyCode ];
	};

	/**
	 * Returns the group to which the passed `keyCode` belongs.
	 *
	 * @since 4.4.5
	 * @static
	 * @param {Number} keyCode
	 * @returns {Number}
	 */
	KeystrokeManager.getKeyGroup = function( keyCode ) {
		var keyGroups = KeystrokeManager.keyGroups;

		return backspaceOrDelete[ keyCode ] ? keyGroups.FUNCTIONAL : keyGroups.PRINTABLE;
	};

	/**
	 * @since 4.4.5
	 * @static
	 * @param {Number} keyGroup
	 * @returns {Number}
	 */
	KeystrokeManager.getOppositeKeyGroup = function( keyGroup ) {
		var keyGroups = KeystrokeManager.keyGroups;
		return ( keyGroup == keyGroups.FUNCTIONAL ? keyGroups.PRINTABLE : keyGroups.FUNCTIONAL );
	};

	/**
	 * Whether we need to use a workaround for functional (*Backspace*, *Delete*) keys not firing
	 * the `keypress` event in Internet Explorer in this environment and for the specified `keyCode`.
	 *
	 * @since 4.4.5
	 * @static
	 * @param {Number} keyCode
	 * @returns {Boolean}
	 */
	KeystrokeManager.ieFunctionalKeysBug = function( keyCode ) {
		return CKEDITOR.env.ie && KeystrokeManager.getKeyGroup( keyCode ) == KeystrokeManager.keyGroups.FUNCTIONAL;
	};

	// Helper method called when keystrokeManager.typing val was changed to true.
	function onTypingStart( keystrokeManager ) {
		// It's safe to now indicate typing state.
		keystrokeManager.typing = true;

		// Manually mark snapshot as available.
		keystrokeManager.hasUndo = true;
		keystrokeManager.hasRedo = false;

		keystrokeManager.onChange();
	}

	/**
	 * Contains a snapshot of the editor content and selection at a given point in time.
	 *
	 * @private
	 * @class CKEDITOR.plugins.keystrokelog.Image
	 * @constructor Creates an Image class instance.
	 * @param {CKEDITOR.editor} editor The editor instance on which the image is created.
	 * @param {Boolean} [contentsOnly] If set to `true`, the image will only contain content without the selection.
	 */
	var Image = CKEDITOR.plugins.keystrokelog.Image = function( editor, contentsOnly ) {
			this.editor = editor;

			editor.fire( 'beforeUndoImage' );

			var contents = editor.getSnapshot();

			// In IE, we need to remove the expando attributes.
			if ( CKEDITOR.env.ie && contents )
				contents = contents.replace( /\s+data-cke-expando=".*?"/g, '' );

			this.contents = contents;

			if ( !contentsOnly ) {
				var selection = contents && editor.getSelection();
				this.bookmarks = selection && selection.createBookmarks2( true );
			}

			editor.fire( 'afterUndoImage' );
		};

	// Attributes that browser may changing them when setting via innerHTML.
	var protectedAttrs = /\b(?:href|src|name)="[^"]*?"/gi;

	Image.prototype = {
		/**
		 * @param {CKEDITOR.plugins.keystrokelog.Image} otherImage Image to compare to.
		 * @returns {Boolean} Returns `true` if content in `otherImage` is the same.
		 */
		equalsContent: function( otherImage ) {
			var thisContents = this.contents,
				otherContents = otherImage.contents;

			// For IE7 and IE QM: Comparing only the protected attribute values but not the original ones.(#4522)
			if ( CKEDITOR.env.ie && ( CKEDITOR.env.ie7Compat || CKEDITOR.env.quirks ) ) {
				thisContents = thisContents.replace( protectedAttrs, '' );
				otherContents = otherContents.replace( protectedAttrs, '' );
			}

			if ( thisContents != otherContents )
				return false;

			return true;
		},

		/**
		 * @param {CKEDITOR.plugins.keystrokelog.Image} otherImage Image to compare to.
		 * @returns {Boolean} Returns `true` if selection in `otherImage` is the same.
		 */
		equalsSelection: function( otherImage ) {
			var bookmarksA = this.bookmarks,
				bookmarksB = otherImage.bookmarks;

			if ( bookmarksA || bookmarksB ) {
				if ( !bookmarksA || !bookmarksB || bookmarksA.length != bookmarksB.length )
					return false;

				for ( var i = 0; i < bookmarksA.length; i++ ) {
					var bookmarkA = bookmarksA[ i ],
						bookmarkB = bookmarksB[ i ];

					if ( bookmarkA.startOffset != bookmarkB.startOffset || bookmarkA.endOffset != bookmarkB.endOffset ||
						!CKEDITOR.tools.arrayCompare( bookmarkA.start, bookmarkB.start ) ||
						!CKEDITOR.tools.arrayCompare( bookmarkA.end, bookmarkB.end ) ) {
						return false;
					}
				}
			}

			return true;
		}

		/**
		 * Editor content.
		 *
		 * @readonly
		 * @property {String} contents
		 */

		/**
		 * Bookmarks representing the selection in an image.
		 *
		 * @readonly
		 * @property {Object[]} bookmarks Array of bookmark2 objects, see {@link CKEDITOR.dom.range#createBookmark2} for definition.
		 */
	};

	/**
	 * A class encapsulating all native event listeners which have to be used in
	 * order to handle undo manager integration for native editing actions (excluding drag and drop and paste support
	 * handled by the Clipboard plugin).
	 *
	 * @since 4.4.4
	 * @private
	 * @class CKEDITOR.plugins.keystrokelog.NativeEditingHandler
	 * @member CKEDITOR.plugins.keystrokelog Undo manager owning the handler.
	 * @constructor
	 * @param {CKEDITOR.plugins.keystrokelog.KeystrokeManager} keystrokeManager
	 */
	var NativeEditingHandler =
		CKEDITOR.plugins.keystrokelog.NativeEditingHandler = function( keystrokeManager ) {
		// We'll use keyboard + input events to determine if snapshot should be created.
		// Since `input` event is fired before `keyup`. We can tell in `keyup` event if input occured.
		// That will tell us if any printable data was inserted.
		// On `input` event we'll increase input fired counter for proper key code.
		// Eventually it might be canceled by paste/drop using `ignoreInputEvent` flag.
		// Order of events can be found in http://www.w3.org/TR/DOM-Level-3-Events/

		/**
		 * An undo manager instance owning the editing handler.
		 *
		 * @property {CKEDITOR.plugins.keystrokelog.KeystrokeManager} keystrokeManager
		 */
		this.keystrokeManager = keystrokeManager;

		/**
		 * See {@link #ignoreInputEventListener}.
		 *
		 * @since 4.4.5
		 * @private
		 */
		this.ignoreInputEvent = false;

		/**
		 * A stack of pressed keys.
		 *
		 * @since 4.4.5
		 * @property {CKEDITOR.plugins.keystrokelog.KeyEventsStack} keyEventsStack
		 */
		this.keyEventsStack = new KeyEventsStack();

		/**
		 * An image of the editor during the `keydown` event (therefore without DOM modification).
		 *
		 * @property {CKEDITOR.plugins.keystrokelog.Image} lastKeydownImage
		 */
		this.lastKeydownImage = null;
	};

	NativeEditingHandler.prototype = {
		/**
		 * The `keydown` event listener.
		 *
		 * @param {CKEDITOR.dom.event} evt
		 */
		onKeydown: function( evt ) {
			// garyfeng: log it
			this.logit("ONKEYDOWN", evt);
			// end garyfeng

			var keyCode = evt.data.getKey();

			// The composition is in progress - ignore the key. (#12597)
			if ( keyCode === 229 ) {
				return;
			}

			// Block undo/redo keystrokes when at the bottom/top of the undo stack (#11126 and #11677).
			if ( CKEDITOR.tools.indexOf( keystrokes, evt.data.getKeystroke() ) > -1 ) {
				evt.data.preventDefault();
				return;
			}

			// Cleaning tab functional keys.
			this.keyEventsStack.cleanUp( evt );

			var keystrokeManager = this.keystrokeManager;

			// Gets last record for provided keyCode. If not found will create one.
			var last = this.keyEventsStack.getLast( keyCode );
			if ( !last ) {
				this.keyEventsStack.push( keyCode );
			}

			// We need to store an image which will be used in case of key group
			// change.
			this.lastKeydownImage = new Image( keystrokeManager.editor );

			if ( KeystrokeManager.isNavigationKey( keyCode ) || this.keystrokeManager.keyGroupChanged( keyCode ) ) {
				if ( keystrokeManager.strokesRecorded[ 0 ] || keystrokeManager.strokesRecorded[ 1 ] ) {
					// We already have image, so we'd like to reuse it.

					// #12300
					keystrokeManager.save( false, this.lastKeydownImage, false );
					keystrokeManager.resetType();
				}
			}
		},

		/**
		 * The `input` event listener.
		 */
		onInput: function() {
			// Input event is ignored if paste/drop event were fired before.
			if ( this.ignoreInputEvent ) {
				// Reset flag - ignore only once.
				this.ignoreInputEvent = false;
				return;
			}

			var lastInput = this.keyEventsStack.getLast();
			// Nothing in key events stack, but input event called. Interesting...
			// That's because on Android order of events is buggy and also keyCode is set to 0.
			if ( !lastInput ) {
				lastInput = this.keyEventsStack.push( 0 );
			}

			// garyfeng: log it
			this.logit("ONINPUT", lastInput);
			// end garyfeng


			// Increment inputs counter for provided key code.
			this.keyEventsStack.increment( lastInput.keyCode );

			// Exceeded limit.
			if ( this.keyEventsStack.getTotalInputs() >= this.keystrokeManager.strokesLimit ) {
				this.keystrokeManager.type( lastInput.keyCode, true );
				this.keyEventsStack.resetInputs();
			}
		},

		/**
		 * The `keyup` event listener.
		 *
		 * @param {CKEDITOR.dom.event} evt
		 */
		onKeyup: function( evt ) {
			// garyfeng: log it
			this.logit("ONKEYUP", evt);
			// end garyfeng

			var keystrokeManager = this.keystrokeManager,
				keyCode = evt.data.getKey(),
				totalInputs = this.keyEventsStack.getTotalInputs();

			// Remove record from stack for provided key code.
			this.keyEventsStack.remove( keyCode );

			// Second part of the workaround for IEs functional keys bug. We need to check whether something has really
			// changed because we blindly mocked the keypress event.
			// Also we need to be aware that lastKeydownImage might not be available (#12327).
			if ( KeystrokeManager.ieFunctionalKeysBug( keyCode ) && this.lastKeydownImage &&
				this.lastKeydownImage.equalsContent( new Image( keystrokeManager.editor, true ) ) ) {
				return;
			}

			if ( totalInputs > 0 ) {
				keystrokeManager.type( keyCode );
			} else if ( KeystrokeManager.isNavigationKey( keyCode ) ) {
				// Note content snapshot has been checked in keydown.
				this.onNavigationKey( true );
			}
		},

		/**
		 * Method called for navigation change. At first it will check if current content does not differ
		 * from the last saved snapshot.
		 *
		 * * If the content is different, the method creates a standard, extra snapshot.
		 * * If the content is not different, the method will compare the selection, and will
		 * amend the last snapshot selection if it changed.
		 *
		 * @param {Boolean} skipContentCompare If set to `true`, it will not compare content, and only do a selection check.
		 */
		onNavigationKey: function( skipContentCompare ) {
			var keystrokeManager = this.keystrokeManager;

			// We attempt to save content snapshot, if content didn't change, we'll
			// only amend selection.
			if ( skipContentCompare || !keystrokeManager.save( true, null, false ) )
				keystrokeManager.updateSelection( new Image( keystrokeManager.editor ) );

			keystrokeManager.resetType();

			// garyfeng: log it
			this.logit("ONNAVIGATIONKEY", skipContentCompare);
			// end garyfeng

		},

		/**
		 * Makes the next `input` event to be ignored.
		 */
		ignoreInputEventListener: function() {
			this.ignoreInputEvent = true;
		},

		/**
		 * Attaches editable listeners required to provide the undo functionality.
		 */
		attachListeners: function() {
			var editor = this.keystrokeManager.editor,
				editable = editor.editable(),
				that = this;

			// We'll create a snapshot here (before DOM modification), because we'll
			// need unmodified content when we got keygroup toggled in keyup.
			editable.attachListener( editable, 'keydown', function( evt ) {
				that.onKeydown( evt );

				// On IE keypress isn't fired for functional (backspace/delete) keys.
				// Let's pretend that something's changed.
				if ( KeystrokeManager.ieFunctionalKeysBug( evt.data.getKey() ) ) {
					that.onInput();
				}
			}, null, null, 999 );

			// Only IE can't use input event, because it's not fired in contenteditable.
			editable.attachListener( editable, ( CKEDITOR.env.ie ? 'keypress' : 'input' ), that.onInput, that, null, 999 );

			// Keyup executes main snapshot logic.
			editable.attachListener( editable, 'keyup', that.onKeyup, that, null, 999 );

			// On paste and drop we need to ignore input event.
			// It would result with calling keystrokeManager.type() on any following key.
			editable.attachListener( editable, 'paste', that.ignoreInputEventListener, that, null, 999 );
			editable.attachListener( editable, 'drop', that.ignoreInputEventListener, that, null, 999 );

			// Click should create a snapshot if needed, but shouldn't cause change event.
			// Don't pass onNavigationKey directly as a listener because it accepts one argument which
			// will conflict with evt passed to listener.
			// #12324 comment:4
			editable.attachListener( editable.isInline() ? editable : editor.document.getDocumentElement(), 'click', function() {
				that.onNavigationKey();
			}, null, null, 999 );

			// When pressing `Tab` key while editable is focused, `keyup` event is not fired.
			// Which means that record for `tab` key stays in key events stack.
			// We assume that when editor is blurred `tab` key is already up.
			editable.attachListener( this.keystrokeManager.editor, 'blur', function() {
				that.keyEventsStack.remove( 9 /*Tab*/ );
			}, null, null, 999 );
		}
	};

	/**
	 * This class represents a stack of pressed keys and stores information
	 * about how many `input` events each key press has caused.
	 *
	 * @since 4.4.5
	 * @private
	 * @class CKEDITOR.plugins.keystrokelog.KeyEventsStack
	 * @constructor
	 */
	var KeyEventsStack = CKEDITOR.plugins.keystrokelog.KeyEventsStack = function() {
		/**
		 * @readonly
		 */
		this.stack = [];
	};

	KeyEventsStack.prototype = {
		/**
		 * Pushes a literal object with two keys: `keyCode` and `inputs` (whose initial value is set to `0`) to stack.
		 * It is intended to be called on the `keydown` event.
		 *
		 * @param {Number} keyCode
		 */
		push: function( keyCode ) {
			var length = this.stack.push( { keyCode: keyCode, inputs: 0 } );
			return this.stack[ length - 1 ];
		},

		/**
		 * Returns the index of the last registered `keyCode` in the stack.
		 * If no `keyCode` is provided, then the function will return the index of the last item.
		 * If an item is not found, it will return `-1`.
		 *
		 * @param {Number} [keyCode]
		 * @returns {Number}
		 */
		getLastIndex: function( keyCode ) {
			if ( typeof keyCode != 'number' ) {
				return this.stack.length - 1; // Last index or -1.
			} else {
				var i = this.stack.length;
				while ( i-- ) {
					if ( this.stack[ i ].keyCode == keyCode ) {
						return i;
					}
				}
				return -1;
			}
		},

		/**
		 * Returns the last key recorded in the stack. If `keyCode` is provided, then it will return
		 * the  last record for this `keyCode`.
		 *
		 * @param {Number} [keyCode]
		 * @returns {Object} Last matching record or `null`.
		 */
		getLast: function( keyCode ) {
			var index = this.getLastIndex( keyCode );
			if ( index != -1 ) {
				return this.stack[ index ];
			} else {
				return null;
			}
		},

		/**
		 * Increments registered input events for stack record for a given `keyCode`.
		 *
		 * @param {Number} keyCode
		 */
		increment: function( keyCode ) {
			var found = this.getLast( keyCode );
			if ( !found ) { // %REMOVE_LINE%
				throw new Error( 'Trying to increment, but could not found by keyCode: ' + keyCode + '.' ); // %REMOVE_LINE%
			} // %REMOVE_LINE%

			found.inputs++;
		},

		/**
		 * Removes the last record from the stack for the provided `keyCode`.
		 *
		 * @param {Number} keyCode
		 */
		remove: function( keyCode ) {
			var index = this.getLastIndex( keyCode );

			if ( index != -1 ) {
				this.stack.splice( index, 1 );
			}
		},

		/**
		 * Resets the `inputs` value to `0` for a given `keyCode` or in entire stack if a
		 * `keyCode` is not specified.
		 *
		 * @param {Number} [keyCode]
		 */
		resetInputs: function( keyCode ) {
			if ( typeof keyCode == 'number' ) {
				var last = this.getLast( keyCode );

				if ( !last ) { // %REMOVE_LINE%
					throw new Error( 'Trying to reset inputs count, but could not found by keyCode: ' + keyCode + '.' ); // %REMOVE_LINE%
				} // %REMOVE_LINE%

				last.inputs = 0;
			} else {
				var i = this.stack.length;
				while ( i-- ) {
					this.stack[ i ].inputs = 0;
				}
			}
		},

		/**
		 * Sums up inputs number for each key code and returns it.
		 *
		 * @returns {Number}
		 */
		getTotalInputs: function() {
			var i = this.stack.length,
				total = 0;

			while ( i-- ) {
				total += this.stack[ i ].inputs;
			}
			return total;
		},

		/**
		 * Cleans the stack based on a provided `keydown` event object. The rationale behind this method
		 * is that some keystrokes cause the `keydown` event to be fired in the editor, but not the `keyup` event.
		 * For instance, *Alt+Tab* will fire `keydown`, but since the editor is blurred by it, then there is
		 * no `keyup`, so the keystroke is not removed from the stack.
		 *
		 * @param {CKEDITOR.dom.event} event
		 */
		cleanUp: function( event ) {
			var nativeEvent = event.data.$;

			if ( !( nativeEvent.ctrlKey || nativeEvent.metaKey ) ) {
				this.remove( 17 );
			}
			if ( !nativeEvent.shiftKey ) {
				this.remove( 16 );
			}
			if ( !nativeEvent.altKey ) {
				this.remove( 18 );
			}
		}
	};
} )();

/**
 * The number of undo steps to be saved. The higher value is set, the more
 * memory is used for it.
 *
 *		config.undoStackSize = 50;
 *
 * @cfg {Number} [undoStackSize=20]
 * @member CKEDITOR.config
 */

/**
 * Fired when the editor is about to save an undo snapshot. This event can be
 * fired by plugins and customizations to make the editor save undo snapshots.
 *
 * @event saveSnapshot
 * @member CKEDITOR.editor
 * @param {CKEDITOR.editor} editor This editor instance.
 */

/**
 * Fired before an undo image is to be created. An *undo image* represents the
 * editor state at some point. It is saved into the undo store, so the editor is
 * able to recover the editor state on undo and redo operations.
 *
 * @since 3.5.3
 * @event beforeUndoImage
 * @member CKEDITOR.editor
 * @param {CKEDITOR.editor} editor This editor instance.
 * @see CKEDITOR.editor#afterUndoImage
 */

/**
 * Fired after an undo image is created. An *undo image* represents the
 * editor state at some point. It is saved into the undo store, so the editor is
 * able to recover the editor state on undo and redo operations.
 *
 * @since 3.5.3
 * @event afterUndoImage
 * @member CKEDITOR.editor
 * @param {CKEDITOR.editor} editor This editor instance.
 * @see CKEDITOR.editor#beforeUndoImage
 */

/**
 * Fired when the content of the editor is changed.
 *
 * Due to performance reasons, it is not verified if the content really changed.
 * The editor instead watches several editing actions that usually result in
 * changes. This event may thus in some cases be fired when no changes happen
 * or may even get fired twice.
 *
 * If it is important not to get the `change` event fired too often, you should compare the
 * previous and the current editor content inside the event listener. It is
 * not recommended to do that on every `change` event.
 *
 * Please note that the `change` event is only fired in the {@link #property-mode wysiwyg mode}.
 * In order to implement similar functionality in the source mode, you can listen for example to the {@link #key}
 * event or the native [`input`](https://developer.mozilla.org/en-US/docs/Web/Reference/Events/input)
 * event (not supported by Internet Explorer 8).
 *
 *		editor.on( 'mode', function() {
 *			if ( this.mode == 'source' ) {
 *				var editable = editor.editable();
 *				editable.attachListener( editable, 'input', function() {
 *					// Handle changes made in the source mode.
 *				} );
 *			}
 *		} );
 *
 * @since 4.2
 * @event change
 * @member CKEDITOR.editor
 * @param {CKEDITOR.editor} editor This editor instance.
 */
