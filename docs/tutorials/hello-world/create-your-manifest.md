# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-hello-world/create-your-manifest/](https://docs.owlbear.rodeo/extensions/tutorial-hello-world/create-your-manifest/)

---

# Create Your Manifest

## Add an Icon

Before we add our extension manifest let's add an icon for the extension action.

Create a new `icon.svg` file in the public folder of your `hello-world` project:

public/icon.svg
[code]
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">  
      <circle cx="12" cy="12" r="9" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="2" />  
    </svg>  
    
[/code]

## Add a Manifest

An Owlbear Rodeo manifest tells Owlbear Rodeo how to load your extension.

We'll create a simple manifest that allows us to load our Vite starter site as an embedded popover in Owlbear Rodeo.

Create a new `manifest.json` file in the public folder of your `hello-world` project:

public/manifest.json
[code]
    {  
      "name": "Hello, World!",  
      "version": "1.0.0",  
      "manifest_version": 1,  
      "action": {  
        "title": "Hello, World!",  
        "icon": "/icon.svg",  
        "popover": "/",  
        "height": 600,  
        "width": 400  
      }  
    }  
    
[/code]

For more information about the manifest format for Owlbear Rodeo see [here](/extensions/reference/manifest).