# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/showing-the-initiative/](https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/showing-the-initiative/)

---

# Showing the Initiative

Now that we can add and remove items to the initiative tracker we'd like to show these values to the players.

Create a new `initiativeList.js` file in the base of the project.

initiativeList.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    const ID = "com.tutorial.initiative-tracker";  
      
    export function setupInitiativeList(element) {  
      const renderList = (items) => {  
        //  
      };  
      OBR.scene.items.onChange(renderList);  
    }  
    
[/code]

The `setupInitiativeList` will takes in a `HTMLUListElement` and will respond to changes in the Owlbear Rodeo scene.

To display the items that have an initiative value edit the `renderList` function.

initiativeList.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    const ID = "com.tutorial.initiative-tracker";  
      
    export function setupInitiativeList(element) {  
      const renderList = (items) => {  
        // Get the name and initiative of any item with  
        // our initiative metadata  
        const initiativeItems = [];  
        for (const item of items) {  
          const metadata = item.metadata[`${ID}/metadata`];  
          if (metadata) {  
            initiativeItems.push({  
              initiative: metadata.initiative,  
              name: item.name,  
            });  
          }  
        }  
        // Sort so the highest initiative value is on top  
        const sortedItems = initiativeItems.sort(  
          (a, b) => parseFloat(b.initiative) - parseFloat(a.initiative)  
        );  
        // Create new list nodes for each initiative item  
        const nodes = [];  
        for (const initiativeItem of sortedItems) {  
          const node = document.createElement("li");  
          node.innerHTML = `${initiativeItem.name} (${initiativeItem.initiative})`;  
          nodes.push(node);  
        }  
        element.replaceChildren(...nodes);  
      };  
      OBR.scene.items.onChange(renderList);  
    }  
    
[/code]

Above we find all items that have our initiative metadata and sort them so the highest value is first. We then create a `HTMLListElement` for each value and replace the children of the input element with our new nodes.

To use the `setupInitiativeList` function import it into the `main.js` file.

main.js
[code]
    import "./style.css";  
    import OBR from "@owlbear-rodeo/sdk";  
    import { setupContextMenu } from "./contextMenu";  
    import { setupInitiativeList } from "./initiativeList";  
      
    document.querySelector("#app").innerHTML = `  
      <div>  
        <h1>Initiative Tracker</h1>  
        <ul id="initiative-list"></ul>  
      </div>  
    `;  
      
    OBR.onReady(() => {  
      setupContextMenu();  
      setupInitiativeList(document.querySelector("#initiative-list"));  
    });  
    
[/code]

Now when you add an item to the initiative it will show up in your action popover.

![Initiative List](/assets/images/initiativeList-8e0cf40a7b4a8d46dacfb389ac278541.jpg)