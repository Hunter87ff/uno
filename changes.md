## New Features

- add new module for a dedicated room configuration, in which players will be customizing their room settings and preferences.
- new proposed room settings and game rules :

    - new cards (there will be options to enable or disable them in the room settings - make it a custom window with a setting button to toggle the window during in the lobby) :
        - "Double Trouble" : a card that allows a player to play two cards in one turn.
        - "Swap Hands" : a card that allows a player to swap their hand with the next player, and everybody has to do it.
        - "Snatch" : a card that allows a player to take(SWAP) a random card from another player.
        - "Shield" : a card that allows a player to protect themselves from any negative effects for one turn. this card can be used anytime during the match. and the availability of this card is 1 in the deck.
        - new plus cards : plus six, plus ten card which is similar to plus four card with same rules but different number of cards to be drawn.

    - updated rules:
        - if a player uses a plus card, the next player can play another same or higher number plus card to stack the effect.
        - there will be a timer to each turn, if a player doesn't play a card within the time limit, they will be forced to draw a card from the deck. (the time limit can be set in the room settings, default is 30 seconds)
        - make the game window horizontal by default, but allow players to toggle it to vertical mode in the room settings.
        - elimination card limit : host get to toggle. if on, then choose a specific number of max cards a player can hold, and during match if a player exceds the limit of cards, they will be eliminated from the match (won't have any turn, just can see the match). if off, then no limit on cards.

Note

> make sure these changes follows best practices and are well-documented in the codebase. All new features should be tested thoroughly to ensure they work as intended and do not introduce any bugs or issues. make it clear and modular in the codebase, so that future developers can easily understand and modify the code if needed.
> make sure all the ui implementation and changes are consistent with the overall design and user experience of the game. All new UI elements should be intuitive and easy to use for players of all skill levels.
