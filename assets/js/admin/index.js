import { render } from '@wordpress/element'
import App from './components/App'

document.addEventListener('DOMContentLoaded', () => {
	const root = document.getElementById('hoatzinmedia-admin-app')
	if (!root) {
		return
	}
	render(<App />, root)
})

