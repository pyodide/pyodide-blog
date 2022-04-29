## Introduction
I've been working in Edtech for 7 years now and one of the biggest pain points of every learning management system is to keep the number of elearners dropouts as low as possible.

[Based on the statistics](https://www.researchgate.net/publication/330316898_The_MOOC_pivot) 52 % of the students who register for a course never look at the course and dropout rate can reach 96% because of multiple reasons like:
- Level of motivation
- Inability to understand the course
- Work experience
- Lack of time
- Insufficient background knowledge
- Unavailability of support/help 

Personally, I enrolled in many programming courses online and I stopped following many of them because they had long videos, and a lot of boring texts also I had to prepare an environment locally on my laptop to be able to follow the course and I ran into some problems.

So what can we do to reduce the dropout rate? One way to do it is by boosting the learners' engagement with interactive courses and hands-on learning activities.

## Learn By Doing

> You learn more from doing 

While learning from others may feel easier or more comfortable (this is why schools exist), at the end of the day it is a hands-on experience that makes us better at what we do. The reason learning from others is better than doing it yourself is that it's faster. Learning with others is a much more passive activity where you're absorbing what they have to say, instead of constructing and executing. The downside here is that you are not in control of how things are presented - there's no guarantee they will even present the topic the way you need to learn it.

In software development, we can learn a lot from those who have been through the trenches. We love to consume videos, blogs, and podcasts on topics like software architecture, design patterns, testing practice, etc. The problem with learning by reading or watching videos is that we don't get a sense of how things work in the context of real development. Books are wonderful educational tools but they're not so good for experiential learning. The only way to understand something is to build it yourself.

A great side effect of learning by doing is that while you're working on something, there will probably be times when you get stuck. This can be frustrating but is a great thing. When you hit a wall and start to question things, it means that your brain is trying to process everything and find a better way - this will ultimately make you a better developer.


## How Webassembly can help?

First, let's talk about existing solutions for learning by doing in the market. Let's say you want to teach Python to your students by providing a code editor in your course where users can write Python code there, run it and get some feedback. After doing your research you find a provider for your needs. What they offer is:
- You prepare an environment (for example Visual Studio Code Server) where you install Python and all the dependencies you want to use in your course
- They create an image from this environment in their system
- When your users visit the learning material, they click on a button to launch their code editor. What it does is to spin up a new VM in the background based on the image your service provider created.

![without-wasm](https://1641270454-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FQ8tEFREQxsT5hL9zOsp1%2Fuploads%2FoSxBmxQbv7HOI2UPEOFS%2FIMG_0016.jpg?alt=media&token=32a93f60-903a-45a6-9ad4-d0fe4c65af69)

With Webassembly we can run the code editor in the users' browsers instead of spinning up a new VM.

![with-wasm](https://1641270454-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FQ8tEFREQxsT5hL9zOsp1%2Fuploads%2FhakGirDsDN0UCORRvZjU%2FIMG_0017.jpg?alt=media&token=f363038c-c3c0-4342-a0e5-b00f6bdd6f69)

Using Webassembly to create Learning Labs has multiple benefits:

- Safer: Since the user's code executes in the browser, there is no risk of malicious code injections in the servers.
- Faster: By using Webassembly we can run the code at near-native speed. No delay for spinning up the environment and back and forth between the browser and the server.
- Cheaper: Lab providers charge us based on the number of VMs and the resources used by the users. With Webassembly we are running the Lab on the users' browsers and we don't need to pay for the VM.
- Scalable: We can scale the number of users who interact with our Lab without worrying about the bill the Lab provider is going to send us at the end of the month.
- Accessible to everyone: Since this is a cheaper solution we can offer it to everyone.
- Offline friendly: Since the Lab environment is running locally on the user's browser they can use the Lab even if they are offline.

## Pyodide for education

Recently I was working on a Proof of concept for using Webassembly for CS education and I was working on a project to build an embeddable code editor that can run Python code.
The result was exciting. Over a weekend I was able to build the editor using Pyodide and Codemirror and  Since I worked with [Open edX](open.edx.org) for many years I embedded the editor in a course unit there.

![openedx-editor](https://media.giphy.com/media/JC4XeEu3DtLRakCvVv/giphy.gif)

## Example

You can check the editor I built using Pyodide at [wasmeditor.com](https://wasmeditor.com) and I wrote a short [doc](https://wasmeditor.com/docs) on how to use it.

I also wrote a step by step guide on how to build this editor you can check it out in [Testdriven.io](https://testdriven.io/blog/python-webassembly/)