# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/implement-the-color-picker/](https://docs.owlbear.rodeo/extensions/tutorial-custom-tool/implement-the-color-picker/)

---

# Implement the Color Picker

In this section we're going to use the [Popover API](/extensions/apis/popover) to show a drop down menu when the color action is clicked.

## Create the Color Picker Route

The Popover API allows us to embed a new site as a popover on the main Owlbear Rodeo content. To make use of this let's create a new `color-picker` route with its own `html` and `js` file.

Create a `color-picker.html` file in the base folder of the project.

color-picker.html
[code]
    <!DOCTYPE html>  
    <html lang="en">  
      <head>  
        <meta charset="UTF-8" />  
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />  
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />  
        <title>Color Picker</title>  
      </head>  
      <body>  
        <div id="app"></div>  
        <script type="module" src="/color-picker.js"></script>  
      </body>  
    </html>  
    
[/code]

To use this file as a new route with [Vite](https://vitejs.dev/) create a `vite.config.js` file in the base folder of the project.

vite.config.js
[code]
    import { resolve } from "path";  
    import { defineConfig } from "vite";  
      
    export default defineConfig({  
      build: {  
        rollupOptions: {  
          input: {  
            main: resolve(__dirname, "index.html"),  
            "color-picker": resolve(__dirname, "color-picker.html"),  
          },  
        },  
      },  
    });  
    
[/code]

This tells Vite to treat our `color-picker.html` file as a new page.

## Add the Color Picker Script

To implement the color picker logic create a new `color-picker.js` file in the base folder of the project.

color-picker.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    const ID = "com.tutorial.custom-tool";  
      
    const colors = ["red", "green", "blue"];  
      
    /** Create the select element */  
    function createSelect(defaultValue) {  
      document.querySelector("#app").innerHTML = `  
        <div>  
          <select name="colors" id="colors">  
            ${  
              // Map colors and apply selected option to the default value  
              colors  
                .map((color) => {  
                  const selected = color === defaultValue;  
                  return `<option value="${color}" ${  
                    selected ? "selected" : ""  
                  }>${color}</option>`;  
                })  
                .join("")  
            }  
          </select>  
        </div>  
      `;  
    }  
      
    /** Setup a listener to the selects `change` event */  
    function setupSelect(element) {  
      const updateColor = (event) => {  
        const color = event.target.value;  
        OBR.tool.setMetadata(`${ID}/tool`, { strokeColor: color });  
      };  
      element.addEventListener("change", updateColor);  
    }  
      
    OBR.onReady(async () => {  
      // Get the current stroke color as the default value for the select  
      const metadata = await OBR.tool.getMetadata(`${ID}/tool`);  
      let strokeColor = "red";  
      if (typeof metadata.strokeColor === "string") {  
        strokeColor = metadata.strokeColor;  
      }  
      createSelect(strokeColor);  
      setupSelect(document.querySelector("#colors"));  
    });  
    
[/code]

Here we add a function to create the HTML select element and options for our colors.

Next we setup a `change` listener and update the tool metadata when the selected value changes.

Lastly we make sure to grab the current tool metadata when Owlbear Rodeo is ready and set everything up.

## Open the Color Picker

We want to open this new color picker route when the user selects our custom color action.

Edit the `main.js` file to add an `onClick` listener to the `createAction` function.

main.js
[code]
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
      onClick(_, elementId) {  
        OBR.popover.open({  
          id: `${ID}/color-picker`,  
          height: 40,  
          width: 80,  
          url: "/color-picker.html",  
          anchorElementId: elementId,  
          anchorOrigin: {  
            horizontal: "CENTER",  
            vertical: "BOTTOM",  
          },  
          transformOrigin: {  
            horizontal: "CENTER",  
            vertical: "TOP",  
          },  
        });  
      },  
    });  
    
[/code]

When the action is clicked we open a popover to our `color-picker.html` route. We also set the `anchorOrigin` and `transformOrigin` to ensure that the popover is centered and extends downwards from the action.

Color picker