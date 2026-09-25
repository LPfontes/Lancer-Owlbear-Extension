# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/apis/interaction/](https://docs.owlbear.rodeo/extensions/apis/interaction/)

---

# Interaction

## `OBR.interaction`

Manage interactions with Owlbear Rodeo.

An interaction allows you to provide high frequency updates to Owlbear Rodeo without needing to worry about networking.

Interactions in Owlbear Rodeo use an interpolated snapshot system where high frequency updates are applied in real-time locally but sampled at a lower frequency to be sent over the network to other players.

On the receiving end low frequency snapshots are buffered and interpolated to ensure smooth playback.

Not all item values are available when using an interaction. See here for available values.

# Reference

## Methods

### `startItemInteraction`
[code]
    async startItemInteraction(items)  
    
[/code]

Start an interaction with an item or a list of items in a scene.

These items can be newly created or be references to already existing items in the scene.

Interaction Time Limit

To prevent accidental network usage interactions expire after 30 seconds.

When this happens the interaction will stop sending network traffic but new updates will still be applied locally.

**Parameters**

NAME| TYPE| DESCRIPTION  
---|---|---  
baseState| [Item](/extensions/reference/items/item) | [Item](/extensions/reference/items/item)[]| The item or items to interact with  
  
Returns an InteractionManager that can be used to update and stop this interaction.

**Example**
[code]
     /**  
     * Create a pointer tool mode that starts an interaction on drag start,  
     * updates that interaction on drag move and stops the interaction  
     * on drag end/cancel.  
     */  
    let interaction = null;  
    OBR.tool.createMode({  
      id: "com.example.pointer",  
      icons: [  
        {  
          icon: "/icon.svg",  
          label: "Custom Pointer",  
          filter: {  
            activeTools: ["rodeo.owlbear.tools/pointer"],  
          },  
        },  
      ],  
      async onToolDragStart(_, event) {  
        const pointer = buildPointer().position(event.pointerPosition).build();  
        interaction = await OBR.interaction.startItemInteraction(pointer);  
      },  
      onToolDragMove(_, event) {  
        if (interaction) {  
          const [update] = interaction;  
          update((pointer) => {  
            pointer.position = event.pointerPosition;  
          });  
        }  
      },  
      onToolDragEnd() {  
        if (interaction) {  
          const [_, stop] = interaction;  
          stop();  
        }  
        interaction = null;  
      },  
      onToolDragCancel() {  
        if (interaction) {  
          const [_, stop] = interaction;  
          stop();  
        }  
        interaction = null;  
      },  
    });  
    
[/code]

* * *

## Type Definitions

### InteractionManager

TYPE  
---  
array  
  
**Properties**

INDEX| NAME| TYPE| DESCRIPTION  
---|---|---|---  
0| update| DispatchInteractionUpdate| A function to dispatch updates to this interaction  
1| stop| function| A function to stop the interaction  
  
* * *

### DispatchInteractionUpdate

Interaction's use [Immer](https://immerjs.github.io/immer/) to provide updates. This function represents an Immer producer that provides a recipe for making immutable updates.

TYPE  
---  
function  
NAME| TYPE| DESCRIPTION  
---|---|---  
update| UpdateInteraction| A callback to apply an update to the previous state of this interaction  
  
* * *

### UpdateInteraction

An [Immer](https://immerjs.github.io/immer/) recipe for updating the current state of an interaction.

TYPE  
---  
function  
NAME| TYPE| DESCRIPTION  
---|---|---  
draft| [Draft](https://immerjs.github.io/immer/)| An immer draft of the current state  
  
* * *

## Interactive Values

When you update a value using an interaction a faster rendering path will be used. This fast path works by skipping the processing of any hierarchy data and updating values directly on the renderer. Because of this method not all parameters are available when changing values in an interaction.

Below is a list of items and the values that can be updated in an interaction:

### [Item](/extensions/reference/items/item)

NAME| TYPE| DESCRIPTION  
---|---|---  
position| [Vector2](/extensions/reference/vector2)| The position of this item  
rotation| number| The rotation of this item in degrees  
scale| [Vector2](/extensions/reference/vector2)| The scale of this item  
  
### [Curve](/extensions/reference/items/curve)

NAME| TYPE| DESCRIPTION  
---|---|---  
points| [Vector2](/extensions/reference/vector2)[]| The list of points to draw  
  
### [Image](/extensions/reference/items/image)

NAME| TYPE| DESCRIPTION  
---|---|---  
image| [ImageContent](/extensions/reference/items/image#imagecontent)| Only the `width` and `height` of the image content  
grid| [ImageGrid](/extensions/reference/items/image#imagegrid)| The grid scale of the image  
  
### [Label](/extensions/reference/items/label)

NAME| TYPE| DESCRIPTION  
---|---|---  
text| [TextContent](/extensions/reference/text-content)| Only the `plainText` can be updated  
  
### [Line](/extensions/reference/items/line)

NAME| TYPE| DESCRIPTION  
---|---|---  
startPosition| [Vector2](/extensions/reference/vector2)| The start position of the line  
endPosition| [Vector2](/extensions/reference/vector2)| The end position of the line  
  
### [Path](/extensions/reference/items/path)

NAME| TYPE| DESCRIPTION  
---|---|---  
commands| PathCommand[]| The list of drawing commands  
  
### [Ruler](/extensions/reference/items/ruler)

NAME| TYPE| DESCRIPTION  
---|---|---  
startPosition| [Vector2](/extensions/reference/vector2)| The start position of the ruler  
endPosition| [Vector2](/extensions/reference/vector2)| The end position of the ruler  
measurement| string| The value to display on the ruler  
  
### [Shape](/extensions/reference/items/shape)

NAME| TYPE| DESCRIPTION  
---|---|---  
width| number| The width of the shape  
height| number| The height of the shape  
  
\--