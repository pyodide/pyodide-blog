const e = React.createElement;

const App = (props) => {
    return e(
        'div', null,
        e('h1', null, 'Hello World'),
        e('p', null, 'This is my first React app.'),
    );
};

// Create the div to render into.
const domContainer = document.createElement('div');
document.body.appendChild(domContainer);

ReactDOM.render(e(App), domContainer);
