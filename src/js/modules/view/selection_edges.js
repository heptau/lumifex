import config from './../../config.js';
import { set_edges_hidden, are_edges_hidden } from './../../libs/marching-ants.js';

/**
 * View > Selection Edges (Alt+Ctrl+H) - hides / shows the marching ants without touching the selection, so the effect
 * of a change can be judged without the outline in the way; the state lasts for the session
 */
class View_selection_edges_class {

	toggle() {
		set_edges_hidden(!are_edges_hidden());
		config.need_render = true;
	}
}

export default View_selection_edges_class;
