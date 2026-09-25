# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/party/](https://docs.owlbear.rodeo/extensions/apis/party/)

---

# Party

## `OBR.party`

The party api gives you access to other players currently in the room.

# Reference

## Methods

### `getPlayers`
[code]
    async getPlayers()  
    
[/code]

Get the other players currently in the room.

Returns an array of Players.

* * *

### `onChange`
[code]
    onChange(callback);  
    
[/code]

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
callback| (players: [Player](/extensions/reference/player)[]) => void| A callback for when any connected player joins, leaves or changes  
  
Returns a function that when called will unsubscribe from change events.

**Example**
[code]
     /**  
     * Use an `onChange` event with a React `useEffect`.  
     * `onChange` returns an unsubscribe event to make this easy.  
     */  
    useEffect(  
      () =>  
        OBR.party.onChange((party) => {  
          // React to party changes  
        }),  
      []  
    );  
    
[/code]

* * *