import logo from './logo.svg';
import './App.css';

function App() {
  const onClick = ()=> {
    console.log(' -- -- -- onClick -- -- --');
  };
  
  const spanClick = ()=> {
    console.log(' -- -- -- spanClick -- -- --');
  };

  const onClickCapture = ()=> {
    console.log(' -- -- -- onClickCapture -- -- --');
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p onClickCapture={ onClickCapture } className="on-capture-p-tag">触发 onClickCapture 事件 ~</p>
        <p onClick={ onClick } className="on-click-p-tag">
          Edit <span onClick={ spanClick } style={{
            background: '#FFF',
            color: 'red'
          }}>src/App.js</span> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;