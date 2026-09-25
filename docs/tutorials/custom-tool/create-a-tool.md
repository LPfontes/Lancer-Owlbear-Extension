# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/create-a-tool/](https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/create-a-tool/)

---

# Create a Tool

## Tools, Tool Modes and Tool Actions

Before we begin creating the new drawing tool let's discuss some of the terms used in a tool.

### Tool

When we create a tool with the `OBR.tool.create` function we're creating a new tool in the toolbar.

The toolbar is located on the right side of the screen and is only shown when a scene is open and ready.

![Toolbar](/assets/images/toolbar-052e636c24f29614461c7ac5d6bbb549.jpg)

### Tool Mode

A tool mode can be created with the `OBR.tool.createMode` function. Tool modes are show on the left side of the top menu.

![Tool Modes](/assets/images/modes-f7b36e08509328f4994a676d58a11dd3.jpg)

When clicked a tool mode will become active. An active mode will receive pointer events for clicks and drags.

### Tool Action

A tool action can be created with the `OBR.tool.createAction` function. Tool actions are show on the right side of the top menu.

![Tool Actions](/assets/images/actions-65bf7038a23dd9990491be3c6028779c.jpg)

In comparison to a tool mode an action does not have an active state. Instead when you click a tool action an event should occur. For example you could open a color picker or fill the scene with fog.

## Create a Tool

Create a new `line.svg` file in the public folder of your project:

public/add.svg
[code]
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">  
      <line x1="6" y1="18" x2="18" y2="6" stroke="#000" stroke-width="4" stroke-linecap="round"></line>  
    </svg>  
    
[/code]

In the `main.js` file create the tool:

main.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    const ID = "com.tutorial.custom-tool";  
      
    function createTool() {  
      OBR.tool.create({  
        id: `${ID}/tool`,  
        icons: [  
          {  
            icon: "/line.svg",  
            label: "Custom Tool",  
          },  
        ],  
        defaultMetadata: {  
          strokeColor: "red",  
        },  
      });  
    }  
      
    OBR.onReady(() => {  
      createTool();  
    });  
    
[/code]

First we create an ID `com.tutorial.custom-tool` to uniquely identify our extension. The convention used here is called reverse domain name notation. This helps us prevent namespace collisions with other extensions. When making your own extension you should change this ID to match the domain name of your site. To learn more see [here](https://en.wikipedia.org/wiki/Reverse_domain_name_notation).

Next we create a tool using this ID and our `line.svg` icon.

Here we also make sure to set the default metadata.

Each tool has it's own metadata that will be persisted in local storage. This allows us to communicate between the tool actions and modes. For example we can have a color picker action that updates the `strokeColor` for the current tool. Then in our line drawing mode we can read that metadata and use the chosen color.

Lastly we listen to the `onReady` event before we create our tool.

Now when we open our room we'll see our custom tool:

![Custom Tool](/assets/images/customTool-6212eede820f6417a27924554a54238f.jpg)

## Create a Tool Mode

If we select our new tool you'll notice that it acts just like the built-in movement tool. To respond to drag and move events let's create a custom tool mode.

main.js
[code]
    function createMode() {  
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
      });  
    }  
    
[/code]

First we create a mode with a custom ID.

Next we set up our modes icons. We only need a single icon so we have a single element in our icons list. Next we have a filter that says our icon will only appear if our custom tool is active.

If we were to remove this filter then our custom mode would be available to all tools.

To learn more about how filters work in Owlbear Rodeo see our reference [here](/extensions/reference/filters).

Next let's make sure we call our `createMode` function in the `onReady` callback:

main.js
[code]
    OBR.onReady(() => {  
      createTool();  
      createMode();  
    });  
    
[/code]

If we go back to Owlbear Rodeo now we'll notice that we haven't actually changed anything. This is because we only have a single mode available for our custom tool. When this is the case Owlbear Rodeo will hide this mode from the top bar. This allows the UI to be cleaner. In order to see our new mode let's continue and create our color picker action.

## Create a Tool Action

Add a `createAction` function to the `main.js` file:

main.js
[code]
    function createAction() {  
      OBR.tool.createAction({  
        id: `${ID}/action`,  
        icons: [  
          {  
            icon: "/icon.svg",  
            label: "Color",  
            filter: {  
              activeTools: [`${ID}/tool`],  
            },  
          },  
        ],  
      });  
    }  
    
[/code]

This function will create a new action with the circle `icon.svg` icon. Like our custom mode it will also only be available when our custom tool is active.

Make sure we call our `createAction` function in the `onReady` callback:

main.js
[code]
    OBR.onReady(() => {  
      createTool();  
      createMode();  
      createAction();  
    });  
    
[/code]

Now when we head back to Owlbear Rodeo and select our tool we'll see two top menu items.

![Top Menu](data:image/jpeg;base64,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WMGiiiqEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//1PyLooor6A4wooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKADrTYpriyl8+2PX7yHow/x96dRSauB01lqdrejah2SjrG3Dfh6j6Vo1wMkCSc9COhHUVPFf6rajakolUdBKM/rwf1pXa3GdvRXJr4hvF4e0Vj6hyv8AQ07/AISO4/58f/Iv/wBhRzILM6qiuV/4SO4/58f/ACL/APYUf8JHcf8APj/5F/8AsKfMgszqqK5X/hI7j/nx/wDIv/2FH/CR3H/Pj/5F/wDsKOZBZnVUVyv/AAkdx/z4/wDkX/7Cj/hI7j/nx/8AIv8A9hRzILM6qiuV/wCEjuP+fH/yL/8AYUf8JHcf8+P/AJF/+wo5kFmdVRXK/wDCR3H/AD4/+Rf/ALCmnxDeNwloqn/act/QUuZBZnWVnXuqWtkNrnfL2jXlvx9B9a5mW/1W6G15REp7RDB/Pk/rUEcCR8jqepPU0Xb2AllmuL2Xz7k9PuoOij/H3p3SiimlYTCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/1fyLooor6A4wooooAKKKKACiiigAooooAKKKKACiiigAooooAKK9K8J/Dq58U+H9W16K5WFdMRm8srkybU3kZzxwK83ZdpxSTCw2iiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAJgUYFLRQAmBRgUtFA7sTAowKWigLsTAowKWigLsTAowKWigLsTAowKWigQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRVmztmu7mK2U4MrqgPuxAruviB4Bn8B31tZTXIuftMPmhgu3BzgjGT0NK6vYdjzyiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/W/IuiiivoDjCiiigAooooAKKKKACiiigAooooAKKKKAClXqKSnL94UAfU/wAIR/xbvxT7xzf+iGr5euRiU/WvqL4Q/wDJO/FH/XOb/wBENXy7c/60/U1Ed2XLZFeiiirICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKANrw+M6taf9d4/wD0IV75+0SAdY0z/r0b/wBDNeCeHv8AkLWn/XeP/wBCFe+ftEf8hjTP+vVv/QzUP4kWvhZ80UUUVZAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf//Z)

In the next part we'll implement our custom line drawing mode.