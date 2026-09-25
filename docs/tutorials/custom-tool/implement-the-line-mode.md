# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/implement-the-line-mode/](https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/implement-the-line-mode/)

---

# Implement the Line Mode

In the previous tutorial we scaffolded the tool mode. Now let's fill it out by creating a line drawing mode.

## Builders

To make it easier to create items in Owlbear Rodeo the SDK offers a set of [builders](/extensions/reference/builders/). These use the [Builder pattern](https://en.wikipedia.org/wiki/Builder_pattern) to make it easier to ensure your item has all the correct properties.

In this example we'll use the [Line Builder](/extensions/reference/builders/line).

Edit the `main.js` file to import our line builder:

main.js
[code]
    import OBR, { buildLine } from "@owlbear-rodeo/sdk";  
    
[/code]

## Interaction

The [Interaction API](/extensions/apis/interaction) allows you to sync and update an item with high frequency over the network. We'll use this API to show the user their in progress drawing. Then once they've finished drawing we'll create the item officially using the [Items API](/extensions/apis/scene/items).

## Drag Events

We want to create a new line when the user drags on the scene. To do this we'll use the drag events (`onToolDragStart`, `onToolDragMove`, `onToolDragEnd` and `onToolDragCancel`).

Edit the `createMode` function in the `main.js` file to respond to drag events.

main.js
[code]
    let interaction = null;  
    OBR.tool.createMode({  
      id: `${ID}/mode`,  
      icons: [  
        {  
          icon: "/line.svg",  
          label: "Line",  
          filter: {  
            activeTools: [`${ID}/tool`],  
          },  
        },  
      ],  
      async onToolDragStart(context, event) {  
        // Get the stroke color from the tools metadata  
        let strokeColor = "red";  
        if (typeof context.metadata.strokeColor === "string") {  
          strokeColor = context.metadata.strokeColor;  
        }  
        // Build a line with the start and end position of our pointer  
        const line = buildLine()  
          .startPosition(event.pointerPosition)  
          .endPosition(event.pointerPosition)  
          .strokeColor(strokeColor)  
          .build();  
        // Start an interaction with the new line  
        interaction = await OBR.interaction.startItemInteraction(line);  
      },  
      onToolDragMove(_, event) {  
        // Update the end position of the interaction when the tool drags  
        if (interaction) {  
          const [update] = interaction;  
          update((line) => {  
            line.endPosition = event.pointerPosition;  
          });  
        }  
      },  
      onToolDragEnd(_, event) {  
        if (interaction) {  
          const [update, stop] = interaction;  
          // Perform a final update when the drag ends  
          // This gets us the final line item  
          const line = update((line) => {  
            line.endPosition = event.pointerPosition;  
          });  
          // Add the line to the scene  
          OBR.scene.items.addItems([line]);  
          // Make sure we stop the interaction so others  
          // can interact with our new line  
          stop();  
        }  
        interaction = null;  
      },  
      onToolDragCancel() {  
        // Stop the interaction early if we cancel the drag  
        // This can happen if the user presses `esc` in the middle  
        // of a drag operation  
        if (interaction) {  
          const [_, stop] = interaction;  
          stop();  
        }  
        interaction = null;  
      },  
    });  
    
[/code]

In the `onToolDragStart` function we create our new line item then start a new interaction with it.

This creates an [InteractionManager](/extensions/apis/interaction#interactionmanager) which allows you to update or stop the interaction. An interaction manager is a tuple with the update function being the first element and the stop function being the second.

For example you can access both functions like this: `const [update, stop] = interaction`.

Next in the `onToolDragMove` function we update the lines end position.

Next in the `onToolDragEnd` function we perform a final update on the lines end position. We then add the line to the scene. This officially creates the item and ensures that it is stored in the scene. It also makes the item available in the undo/redo stack. At the end of the function we make sure to stop the interaction.

Lastly in the `onToolDragCancel` function we stop the interaction immediately without adding the line to the scene. This effectively cancels the operation.

With all this we should now be able to drag on the scene and create new red lines:

Drawing lines with the new mode

In the next section we're going to look at adding a color picker to change the lines color.