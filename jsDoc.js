Functions should be formatted as follows:

Summary: A brief, one line explanation of the purpose of the function. Use a period at the end.
Description: A supplement to the summary, providing a more detailed description. Use a period at the end.
@deprecated x.x.x: Only use for deprecated functions, and provide the version the function was deprecated which should always be 3-digit (e.g. @since 3.6.0), and the function to use instead.
@since x.x.x: Should be 3-digit for initial introduction (e.g. @since 3.6.0). If significant changes are made, additional @since tags, versions, and descriptions should be added to serve as a changelog.
@access: Only use for functions if private. If the function is private, it is intended for internal use only, and there will be no documentation for it in the code reference.
@class: Use for class constructors.
@augments: For class constuctors, list direct parents.
@mixes: List mixins that are mixed into the object.
@alias: If this function is first assigned to a temporary variable this allows you to change the name it’s documented under.
@memberof: Namespace that this function is contained within if JSDoc is unable to resolve this automatically.
@static: For classes, used to mark that a function is a static method on the class constructor.
@see: A function or class relied on.
@link: URL that provides more information.
@fires: Event fired by the function. Events tied to a specific class should list the class name.
@listens: Events this function listens for. An event must be prefixed with the event namespace. Events tied to a specific class should list the class name.
@global: Marks this function as a global function to be included in the global namespace.
@param: Give a brief description of the variable; denote particulars (e.g. if the variable is optional, its default) with JSDoc @param syntax. Use a period at the end.
@yield: For generator functions, a description of the values expected to be yielded from this function. As with other descriptions, include a period at the end.
@return: Note the period after the description.

/**
 * Summary. (use period)
 *
 * Description. (use period)
 *
 * @since      x.x.x
 * @deprecated x.x.x Use new_function_name() instead.
 * @access     private
 *
 * @class
 * @augments parent
 * @mixes    mixin
 *
 * @alias    realName
 * @memberof namespace
 *
 * @see  Function/class relied on
 * @link URL
 * @global
 *
 * @fires   eventName
 * @fires   className#eventName
 * @listens event:eventName
 * @listens className~event:eventName
 *
 * @param {type}   var           Description.
 * @param {type}   [var]         Description of optional variable.
 * @param {type}   [var=default] Description of optional variable with default variable.
 * @param {Object} objectVar     Description.
 * @param {type}   objectVar.key Description of a key in the objectVar parameter.
 *
 * @yield {type} Yielded value description.
 *
 * @return {type} Return value description.
 */
