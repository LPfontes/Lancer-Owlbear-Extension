# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/implement-the-context-menu-item/](https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/implement-the-context-menu-item/)

---

# Implement the Context Menu Item

We now have a button in the context menu but when we click it nothing happens.

To respond to a click on our menu item edit the `onClick` callback in the `contextMenu.js` file.

contextMenu.js
[code]
    onClick(context) {  
      const initiative = window.prompt("Enter the initiative value");  
      OBR.scene.items.updateItems(context.items, (items) => {  
        for (let item of items) {  
          item.metadata[`${ID}/metadata`] = {  
            initiative,  
          };  
        }  
      });  
    },  
    
[/code]

To make things easier we first use [`window.prompt`](https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt) to get user input.

We then use the [`updateItems`](/extensions/apis/scene/items#updateitems) function in the Scene API to update the selected items.

For each item selected we add a value to the its metadata. To avoid collisions with other extension we make sure we prefix our value in the metadata with our ID.

The metadata field on an item allows you to store custom data with that item. The data will also be saved with the scene which means the metadata will be synced with every player who is connected to the room.

# Removing a Character From Initiative

We now have a context menu item that will add an initiative value to a character. In order to to remove a character from initiative let's update our `setupContextMenu` function with a new icon.

contextMenu.js
[code]
    icons: [  
      {  
        icon: "/add.svg",  
        label: "Add to Initiative",  
        filter: {  
          every: [  
            { key: "layer", value: "CHARACTER" },  
            { key: ["metadata", `${ID}/metadata`], value: undefined },  
          ],  
        },  
      },  
      {  
        icon: "/remove.svg",  
        label: "Remove from Initiative",  
        filter: {  
          every: [{ key: "layer", value: "CHARACTER" }],  
        },  
      },  
    ],  
    
[/code]

Above we add the `remove.svg` icon with a label `Remove from Initiative`. In order to show the new icon we've also added a new filter to the `add.svg` icon. The filter checks for the existence of our custom metadata property. If we don't have any initiative yet then we show the `add.svg` icon otherwise we show the `remove.svg` icon.

To learn more about how filters work with context menus see [here](/extensions/reference/filters).

Now that we've added our new icon we need to update the `onClick` handler to remove our metadata when it is clicked.

contextMenu.js
[code]
    onClick(context) {  
      const addToInitiative = context.items.every(  
        (item) => item.metadata[`${ID}/metadata`] === undefined  
      );  
      if (addToInitiative) {  
        const initiative = window.prompt("Enter the initiative value");  
        OBR.scene.items.updateItems(context.items, (items) => {  
          for (let item of items) {  
            item.metadata[`${ID}/metadata`] = {  
              initiative,  
            };  
          }  
        });  
      } else {  
        OBR.scene.items.updateItems(context.items, (items) => {  
          for (let item of items) {  
            delete item.metadata[`${ID}/metadata`]  
          }  
        });  
      }  
    },  
    
[/code]

We first check our selected items to see whether we should add or remove the initiative value. Lastly to remove the initiative value we delete our custom field in the metadata object.

Back in Owlbear Rodeo you will now be able to click the `Add to Initiative` context menu item. Fill in an initiative value then remove that item if needed.

Context Menu item with two modes

The full source of the `contextMenu.js` file should now look like this:

contextMenu.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    const ID = "com.tutorial.initiative-tracker";  
      
    export function setupContextMenu() {  
      OBR.contextMenu.create({  
        id: `${ID}/context-menu`,  
        icons: [  
          {  
            icon: "/add.svg",  
            label: "Add to Initiative",  
            filter: {  
              every: [  
                { key: "layer", value: "CHARACTER" },  
                { key: ["metadata", `${ID}/metadata`], value: undefined },  
              ],  
            },  
          },  
          {  
            icon: "/remove.svg",  
            label: "Remove from Initiative",  
            filter: {  
              every: [{ key: "layer", value: "CHARACTER" }],  
            },  
          },  
        ],  
        onClick(context) {  
          const addToInitiative = context.items.every(  
            (item) => item.metadata[`${ID}/metadata`] === undefined  
          );  
          if (addToInitiative) {  
            const initiative = window.prompt("Enter the initiative value");  
            OBR.scene.items.updateItems(context.items, (items) => {  
              for (let item of items) {  
                item.metadata[`${ID}/metadata`] = {  
                  initiative,  
                };  
              }  
            });  
          } else {  
            OBR.scene.items.updateItems(context.items, (items) => {  
              for (let item of items) {  
                delete item.metadata[`${ID}/metadata`];  
              }  
            });  
          }  
        },  
      });  
    }  
    
[/code]