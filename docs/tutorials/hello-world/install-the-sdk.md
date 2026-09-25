# Owlbear Rodeo Documentation
> Source: [https://docs.owlbear.rodeo/extensions/tutorial-hello-world/install-the-sdk/](https://docs.owlbear.rodeo/extensions/tutorial-hello-world/install-the-sdk/)

---

# Install the SDK

Now that we have our code running as a extension to Owlbear Rodeo we want to be able to interact with the site.

To do this we'll install the [Owlbear Rodeo SDK](https://github.com/owlbear-rodeo/sdk).

Inside your `hello-world` project run:
[code]
    $ npm install @owlbear-rodeo/sdk  
    
[/code]

This will install the SDK using [NPM](https://www.npmjs.com/).

## Interact with the SDK

To test our interaction with the SDK we're going to show a notification every time the counter in the Vite example changes.

Edit the `counter.js` file in the src folder of your `hello-world` project to import the SDK and call `OBR.notification.show` when the counter changes:

src/counter.js
[code]
    import OBR from "@owlbear-rodeo/sdk";  
      
    export function setupCounter(element) {  
      let counter = 0;  
      const setCounter = (count) => {  
        counter = count;  
        element.innerHTML = `count is ${counter}`;  
        OBR.notification.show(`count is ${counter}`);  
      };  
      element.addEventListener("click", () => setCounter(counter + 1));  
      setCounter(0);  
    }  
    
[/code]

Now whenever you click the count button a notification should show in the Owlbear Rodeo interface.

![Notification](/assets/images/notification-a29719f9b9255ec6eb44cccb27623647.jpg)